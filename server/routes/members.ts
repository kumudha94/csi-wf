import { Router } from "express";
import { z } from "zod";
import { insertMemberSchema, MEMBER_STATUSES } from "@shared/schema";
import * as membersStorage from "../storage/members";
import { generateMembersXlsx, isSecondaryColumnKey, type SecondaryColumnKey } from "../lib/xlsx";
import { wrap } from "../lib/asyncHandler";
import { parseId } from "../lib/parseId";
import { fromMoney } from "../lib/money";

export const membersRouter = Router();

const sortFieldSchema = z.enum(["santhaNumber", "name"]).default("santhaNumber");
const sortDirSchema = z.enum(["asc", "desc"]).default("asc");

// Storage returns the raw numeric-column string for defaultAmount; every API
// response serializes it to a plain number, same as contributions/expenses.
function serializeMember<T extends { defaultAmount: string }>(member: T) {
  return { ...member, defaultAmount: fromMoney(member.defaultAmount) };
}

membersRouter.get(
  "/",
  wrap(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const sortBy = sortFieldSchema.parse(req.query.sortBy);
    const sortDir = sortDirSchema.parse(req.query.sortDir);
    const list = await membersStorage.listMembers(search, sortBy, sortDir);
    res.json(list.map(serializeMember));
  })
);

// Registered before "/:id" so it isn't swallowed by the id route.
membersRouter.get(
  "/export",
  wrap(async (req, res) => {
    const sortBy = sortFieldSchema.parse(req.query.sortBy);
    const sortDir = sortDirSchema.parse(req.query.sortDir);

    const memberIds = typeof req.query.memberIds === "string" && req.query.memberIds.length > 0
      ? req.query.memberIds.split(",").map((id) => parseId(id)).filter((id): id is number => id !== null)
      : undefined;

    const statuses = typeof req.query.statuses === "string" && req.query.statuses.length > 0
      ? req.query.statuses.split(",").filter((s): s is (typeof MEMBER_STATUSES)[number] => (MEMBER_STATUSES as readonly string[]).includes(s))
      : undefined;

    const secondaryColumns = typeof req.query.columns === "string" && req.query.columns.length > 0
      ? req.query.columns.split(",").filter(isSecondaryColumnKey)
      : ([] as SecondaryColumnKey[]);

    // Blank print-only columns (e.g. "Signature") — free text, capped so a
    // malicious/careless caller can't ask for an unbounded sheet width.
    const extraColumns = typeof req.query.extraColumns === "string" && req.query.extraColumns.length > 0
      ? req.query.extraColumns.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 10)
      : [];

    const memberRows = await membersStorage.listMembersForExport({ statuses, memberIds, sortBy, sortDir });
    const buffer = await generateMembersXlsx(memberRows, secondaryColumns, extraColumns);

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="csi-wf-members-${today}.xlsx"`);
    res.send(buffer);
  })
);

membersRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const member = await membersStorage.getMember(id);
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    res.json(serializeMember(member));
  })
);

membersRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertMemberSchema.parse(req.body);
    try {
      const member = await membersStorage.createMember(data);
      res.status(201).json(serializeMember(member));
    } catch (error: any) {
      if (error.code === "23505") {
        res.status(409).json({ error: "That santha number is already in use" });
        return;
      }
      throw error;
    }
  })
);

membersRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const data = insertMemberSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    try {
      const member = await membersStorage.updateMember(id, data);
      if (!member) {
        res.status(404).json({ error: "Member not found" });
        return;
      }
      res.json(serializeMember(member));
    } catch (error: any) {
      if (error.code === "23505") {
        res.status(409).json({ error: "That santha number is already in use" });
        return;
      }
      throw error;
    }
  })
);

membersRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    try {
      const deleted = await membersStorage.deleteMember(id);
      if (!deleted) {
        res.status(404).json({ error: "Member not found" });
        return;
      }
    } catch (error: any) {
      // contributions.member_id is ON DELETE RESTRICT, so a member with any
      // recorded contribution cannot be removed — say so instead of 500ing.
      if (error.code === "23503") {
        res.status(409).json({ error: "Cannot delete a member who has recorded contributions" });
        return;
      }
      throw error;
    }
    res.status(204).send();
  })
);

const attributeValueSchema = z.object({ value: z.string() });
// attribute_key is varchar(60); without this an over-long key reaches Postgres
// and comes back as 22001 (string data right truncated) — a raw 500.
const attributeKeySchema = z.string().min(1).max(60, "Attribute key must be at most 60 characters");

membersRouter.put(
  "/:id/attributes/:key",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const key = attributeKeySchema.parse(req.params.key);
    const { value } = attributeValueSchema.parse(req.body);
    try {
      const result = await membersStorage.setMemberAttributeValue(id, key, value);
      res.json(result);
    } catch (error: any) {
      if (error.code === "23503") {
        res.status(404).json({ error: "Member not found" });
        return;
      }
      throw error;
    }
  })
);

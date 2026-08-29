import { Router } from "express";
import { z } from "zod";
import { insertMemberSchema } from "@shared/schema";
import * as membersStorage from "../storage/members";
import { wrap } from "../lib/asyncHandler";
import { parseId } from "../lib/parseId";

export const membersRouter = Router();

membersRouter.get(
  "/",
  wrap(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const list = await membersStorage.listMembers(search);
    res.json(list);
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
    res.json(member);
  })
);

membersRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertMemberSchema.parse(req.body);
    try {
      const member = await membersStorage.createMember(data);
      res.status(201).json(member);
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
      res.json(member);
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

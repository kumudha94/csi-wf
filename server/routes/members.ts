import { Router } from "express";
import { z } from "zod";
import { insertMemberSchema } from "@shared/schema";
import * as membersStorage from "../storage/members";
import { wrap } from "../lib/asyncHandler";

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
    const member = await membersStorage.getMember(Number(req.params.id));
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
    const data = insertMemberSchema.partial().parse(req.body);
    try {
      const member = await membersStorage.updateMember(Number(req.params.id), data);
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
    const deleted = await membersStorage.deleteMember(Number(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    res.status(204).send();
  })
);

const attributeValueSchema = z.object({ value: z.string() });

membersRouter.put(
  "/:id/attributes/:key",
  wrap(async (req, res) => {
    const { value } = attributeValueSchema.parse(req.body);
    const result = await membersStorage.setMemberAttributeValue(Number(req.params.id), req.params.key, value);
    res.json(result);
  })
);

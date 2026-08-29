import { Router } from "express";
import { insertAttributeDefinitionSchema } from "@shared/schema";
import * as attributesStorage from "../storage/attributes";
import { wrap } from "../lib/asyncHandler";

export const attributesRouter = Router();

attributesRouter.get(
  "/",
  wrap(async (_req, res) => {
    const list = await attributesStorage.listAttributeDefinitions();
    res.json(list);
  })
);

attributesRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertAttributeDefinitionSchema.parse(req.body);
    try {
      const attr = await attributesStorage.createAttributeDefinition(data);
      res.status(201).json(attr);
    } catch (error: any) {
      if (error.code === "23505") {
        res.status(409).json({ error: "An attribute with that key already exists" });
        return;
      }
      throw error;
    }
  })
);

attributesRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const deleted = await attributesStorage.deleteAttributeDefinition(Number(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: "Attribute not found" });
      return;
    }
    res.status(204).send();
  })
);

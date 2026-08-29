import { Router } from "express";
import { insertContributionSchema, type Contribution } from "@shared/schema";
import * as contributionsStorage from "../storage/contributions";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";
import { parseId } from "../lib/parseId";

export const contributionsRouter = Router();

// Same reasoning as expenses.ts: storage returns the raw numeric-column
// string, this serializes it to a plain number for every API consumer.
function serializeContribution(contribution: Contribution) {
  return { ...contribution, amount: fromMoney(contribution.amount) };
}

contributionsRouter.get(
  "/",
  wrap(async (req, res) => {
    const raw = req.query.memberId;
    let memberId: number | undefined;
    if (raw !== undefined) {
      const parsed = typeof raw === "string" ? parseId(raw) : null;
      if (parsed === null) {
        res.status(400).json({ error: "Invalid memberId" });
        return;
      }
      memberId = parsed;
    }
    const list = await contributionsStorage.listContributions(memberId);
    res.json(list.map(serializeContribution));
  })
);

contributionsRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertContributionSchema.parse(req.body);
    try {
      const contribution = await contributionsStorage.createContribution(data);
      res.status(201).json(serializeContribution(contribution));
    } catch (error: any) {
      if (error.code === "23503") {
        res.status(400).json({ error: "That member does not exist" });
        return;
      }
      throw error;
    }
  })
);

contributionsRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const data = insertContributionSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const contribution = await contributionsStorage.updateContribution(id, data);
    if (!contribution) {
      res.status(404).json({ error: "Contribution not found" });
      return;
    }
    res.json(serializeContribution(contribution));
  })
);

contributionsRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await contributionsStorage.deleteContribution(id);
    if (!deleted) {
      res.status(404).json({ error: "Contribution not found" });
      return;
    }
    res.status(204).send();
  })
);

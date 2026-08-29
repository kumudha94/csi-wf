import { Router } from "express";
import { insertContributionSchema, type Contribution } from "@shared/schema";
import * as contributionsStorage from "../storage/contributions";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";

export const contributionsRouter = Router();

// Same reasoning as expenses.ts: storage returns the raw numeric-column
// string, this serializes it to a plain number for every API consumer.
function serializeContribution(contribution: Contribution) {
  return { ...contribution, amount: fromMoney(contribution.amount) };
}

contributionsRouter.get(
  "/",
  wrap(async (req, res) => {
    const memberId = typeof req.query.memberId === "string" ? Number(req.query.memberId) : undefined;
    const list = await contributionsStorage.listContributions(memberId);
    res.json(list.map(serializeContribution));
  })
);

contributionsRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertContributionSchema.parse(req.body);
    const contribution = await contributionsStorage.createContribution(data);
    res.status(201).json(serializeContribution(contribution));
  })
);

contributionsRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const data = insertContributionSchema.partial().parse(req.body);
    const contribution = await contributionsStorage.updateContribution(Number(req.params.id), data);
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
    const deleted = await contributionsStorage.deleteContribution(Number(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: "Contribution not found" });
      return;
    }
    res.status(204).send();
  })
);

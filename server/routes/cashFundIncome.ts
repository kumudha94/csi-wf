import { Router } from "express";
import { insertCashFundIncomeSchema, type CashFundIncome } from "@shared/schema";
import * as cashFundIncomeStorage from "../storage/cashFundIncome";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";
import { parseId } from "../lib/parseId";

export const cashFundIncomeRouter = Router();

function serialize(row: CashFundIncome) {
  return { ...row, amount: fromMoney(row.amount) };
}

cashFundIncomeRouter.get(
  "/",
  wrap(async (_req, res) => {
    const list = await cashFundIncomeStorage.listCashFundIncome();
    res.json(list.map(serialize));
  })
);

cashFundIncomeRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertCashFundIncomeSchema.parse(req.body);
    const row = await cashFundIncomeStorage.createCashFundIncome(data);
    res.status(201).json(serialize(row));
  })
);

cashFundIncomeRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const data = insertCashFundIncomeSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const row = await cashFundIncomeStorage.updateCashFundIncome(id, data);
    if (!row) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    res.json(serialize(row));
  })
);

cashFundIncomeRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await cashFundIncomeStorage.deleteCashFundIncome(id);
    if (!deleted) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    res.status(204).send();
  })
);

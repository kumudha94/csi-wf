import { Router } from "express";
import { insertCashFundExpenseSchema, type CashFundExpense } from "@shared/schema";
import * as cashFundExpensesStorage from "../storage/cashFundExpenses";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";
import { parseId } from "../lib/parseId";

export const cashFundExpensesRouter = Router();

function serialize(row: CashFundExpense) {
  return { ...row, amount: fromMoney(row.amount) };
}

cashFundExpensesRouter.get(
  "/",
  wrap(async (_req, res) => {
    const list = await cashFundExpensesStorage.listCashFundExpenses();
    res.json(list.map(serialize));
  })
);

cashFundExpensesRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertCashFundExpenseSchema.parse(req.body);
    const row = await cashFundExpensesStorage.createCashFundExpense(data);
    res.status(201).json(serialize(row));
  })
);

cashFundExpensesRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const data = insertCashFundExpenseSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const row = await cashFundExpensesStorage.updateCashFundExpense(id, data);
    if (!row) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    res.json(serialize(row));
  })
);

cashFundExpensesRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await cashFundExpensesStorage.deleteCashFundExpense(id);
    if (!deleted) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    res.status(204).send();
  })
);

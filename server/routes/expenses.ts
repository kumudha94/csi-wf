import { Router } from "express";
import { insertExpenseSchema, type Expense } from "@shared/schema";
import * as expensesStorage from "../storage/expenses";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";

export const expensesRouter = Router();

// Storage returns the raw Drizzle row, where `amount` is the numeric
// column's string form. Every response is serialized through here so API
// consumers always see a plain number, matching every other resource.
function serializeExpense(expense: Expense) {
  return { ...expense, amount: fromMoney(expense.amount) };
}

expensesRouter.get(
  "/",
  wrap(async (req, res) => {
    const raw = req.query.eventId;
    let eventId: number | null | undefined;
    if (raw === "general") eventId = null;
    else if (typeof raw === "string") eventId = Number(raw);
    const list = await expensesStorage.listExpenses(eventId);
    res.json(list.map(serializeExpense));
  })
);

expensesRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const expense = await expensesStorage.getExpense(Number(req.params.id));
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    res.json(serializeExpense(expense));
  })
);

expensesRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertExpenseSchema.parse(req.body);
    const expense = await expensesStorage.createExpense(data);
    res.status(201).json(serializeExpense(expense));
  })
);

expensesRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const data = insertExpenseSchema.partial().parse(req.body);
    const expense = await expensesStorage.updateExpense(Number(req.params.id), data);
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    res.json(serializeExpense(expense));
  })
);

expensesRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const deleted = await expensesStorage.deleteExpense(Number(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    res.status(204).send();
  })
);

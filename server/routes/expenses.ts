import { Router } from "express";
import { insertExpenseSchema, type Expense } from "@shared/schema";
import * as expensesStorage from "../storage/expenses";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";
import { parseId } from "../lib/parseId";

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
    if (raw !== undefined) {
      if (raw === "general") {
        eventId = null;
      } else {
        const parsed = typeof raw === "string" ? parseId(raw) : null;
        if (parsed === null) {
          res.status(400).json({ error: "Invalid eventId" });
          return;
        }
        eventId = parsed;
      }
    }
    const list = await expensesStorage.listExpenses(eventId);
    res.json(list.map(serializeExpense));
  })
);

expensesRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const expense = await expensesStorage.getExpense(id);
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
    try {
      const expense = await expensesStorage.createExpense(data);
      res.status(201).json(serializeExpense(expense));
    } catch (error: any) {
      if (error.code === "23503") {
        res.status(400).json({ error: "That event does not exist" });
        return;
      }
      throw error;
    }
  })
);

expensesRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const data = insertExpenseSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    try {
      const expense = await expensesStorage.updateExpense(id, data);
      if (!expense) {
        res.status(404).json({ error: "Expense not found" });
        return;
      }
      res.json(serializeExpense(expense));
    } catch (error: any) {
      if (error.code === "23503") {
        res.status(400).json({ error: "That event does not exist" });
        return;
      }
      throw error;
    }
  })
);

expensesRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await expensesStorage.deleteExpense(id);
    if (!deleted) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    res.status(204).send();
  })
);

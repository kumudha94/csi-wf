import { Router } from "express";
import { insertBankTransactionSchema, type BankTransaction } from "@shared/schema";
import * as bankTransactionsStorage from "../storage/bankTransactions";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";
import { parseId } from "../lib/parseId";

export const bankTransactionsRouter = Router();

function serialize(row: BankTransaction) {
  return { ...row, amount: fromMoney(row.amount) };
}

bankTransactionsRouter.get(
  "/",
  wrap(async (_req, res) => {
    const list = await bankTransactionsStorage.listBankTransactions();
    res.json(list.map(serialize));
  })
);

bankTransactionsRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertBankTransactionSchema.parse(req.body);
    const row = await bankTransactionsStorage.createBankTransaction(data);
    res.status(201).json(serialize(row));
  })
);

bankTransactionsRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const data = insertBankTransactionSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const row = await bankTransactionsStorage.updateBankTransaction(id, data);
    if (!row) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json(serialize(row));
  })
);

bankTransactionsRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await bankTransactionsStorage.deleteBankTransaction(id);
    if (!deleted) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.status(204).send();
  })
);

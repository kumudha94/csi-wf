import { db } from "../db";
import { contributions, expenses, settings, cashFundIncome, cashFundExpenses } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { fromMoney } from "../lib/money";

export type BalanceInputs = {
  bankOpeningBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
  cashOpeningBalance: number;
  totalCashIncome: number;
  totalCashExpenses: number;
};

export async function getBalanceInputs(): Promise<BalanceInputs> {
  const [settingsRow] = await db.select().from(settings).limit(1);
  const bankOpeningBalance = settingsRow ? fromMoney(settingsRow.bankOpeningBalance) : 0;
  const cashOpeningBalance = settingsRow ? fromMoney(settingsRow.cashOpeningBalance) : 0;

  const [contribRow] = await db
    .select({ total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
    .from(contributions);
  const totalContributions = fromMoney(contribRow.total);

  const [paidRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(eq(expenses.status, "paid"));
  const totalPaidExpenses = fromMoney(paidRow.total);

  const [pendingRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(eq(expenses.status, "pending"));
  const totalPendingExpenses = fromMoney(pendingRow.total);

  const [cashIncomeRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome);
  const totalCashIncome = fromMoney(cashIncomeRow.total);

  const [cashExpenseRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundExpenses.amount}), 0)` })
    .from(cashFundExpenses);
  const totalCashExpenses = fromMoney(cashExpenseRow.total);

  return {
    bankOpeningBalance,
    totalContributions,
    totalPaidExpenses,
    totalPendingExpenses,
    cashOpeningBalance,
    totalCashIncome,
    totalCashExpenses,
  };
}

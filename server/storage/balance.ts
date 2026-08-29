import { db } from "../db";
import { contributions, expenses, settings } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { fromMoney } from "../lib/money";

export type BalanceInputs = {
  openingBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
};

export async function getBalanceInputs(): Promise<BalanceInputs> {
  const [settingsRow] = await db.select().from(settings).limit(1);
  const openingBalance = settingsRow ? fromMoney(settingsRow.openingBalance) : 0;

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

  return { openingBalance, totalContributions, totalPaidExpenses, totalPendingExpenses };
}

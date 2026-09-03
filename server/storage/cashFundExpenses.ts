import { db } from "../db";
import { cashFundExpenses, type CashFundExpense, type CashFundExpenseInput } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function listCashFundExpenses(): Promise<CashFundExpense[]> {
  return db.select().from(cashFundExpenses).orderBy(desc(cashFundExpenses.date));
}

export async function createCashFundExpense(data: CashFundExpenseInput): Promise<CashFundExpense> {
  const [row] = await db
    .insert(cashFundExpenses)
    .values({ ...data, amount: toMoney(data.amount) })
    .returning();
  return row;
}

export async function updateCashFundExpense(
  id: number,
  data: Partial<CashFundExpenseInput>
): Promise<CashFundExpense | null> {
  const { amount, ...rest } = data;
  const [row] = await db
    .update(cashFundExpenses)
    .set({ ...rest, ...(amount !== undefined ? { amount: toMoney(amount) } : {}) })
    .where(eq(cashFundExpenses.id, id))
    .returning();
  return row ?? null;
}

export async function deleteCashFundExpense(id: number): Promise<boolean> {
  const result = await db
    .delete(cashFundExpenses)
    .where(eq(cashFundExpenses.id, id))
    .returning({ id: cashFundExpenses.id });
  return result.length > 0;
}

import { db } from "../db";
import { cashFundIncome, type CashFundIncome, type CashFundIncomeInput } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function listCashFundIncome(): Promise<CashFundIncome[]> {
  return db.select().from(cashFundIncome).orderBy(desc(cashFundIncome.date));
}

export async function createCashFundIncome(data: CashFundIncomeInput): Promise<CashFundIncome> {
  const [row] = await db
    .insert(cashFundIncome)
    .values({ ...data, amount: toMoney(data.amount) })
    .returning();
  return row;
}

export async function updateCashFundIncome(
  id: number,
  data: Partial<CashFundIncomeInput>
): Promise<CashFundIncome | null> {
  const { amount, ...rest } = data;
  const [row] = await db
    .update(cashFundIncome)
    .set({ ...rest, ...(amount !== undefined ? { amount: toMoney(amount) } : {}) })
    .where(eq(cashFundIncome.id, id))
    .returning();
  return row ?? null;
}

export async function deleteCashFundIncome(id: number): Promise<boolean> {
  const result = await db.delete(cashFundIncome).where(eq(cashFundIncome.id, id)).returning({ id: cashFundIncome.id });
  return result.length > 0;
}

import { db } from "../db";
import { expenses, type Expense, type ExpenseInput } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function listExpenses(eventId?: number | null): Promise<Expense[]> {
  if (eventId === undefined) return db.select().from(expenses);
  if (eventId === null) return db.select().from(expenses).where(isNull(expenses.eventId));
  return db.select().from(expenses).where(eq(expenses.eventId, eventId));
}

export async function getExpense(id: number): Promise<Expense | null> {
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, id));
  return expense ?? null;
}

export async function createExpense(data: ExpenseInput): Promise<Expense> {
  const [expense] = await db
    .insert(expenses)
    .values({ ...data, amount: toMoney(data.amount) })
    .returning();
  return expense;
}

export async function updateExpense(id: number, data: Partial<ExpenseInput>): Promise<Expense | null> {
  const { amount, ...rest } = data;
  const [expense] = await db
    .update(expenses)
    .set({ ...rest, ...(amount !== undefined ? { amount: toMoney(amount) } : {}) })
    .where(eq(expenses.id, id))
    .returning();
  return expense ?? null;
}

export async function deleteExpense(id: number): Promise<boolean> {
  const result = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
  return result.length > 0;
}

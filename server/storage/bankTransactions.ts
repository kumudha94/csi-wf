import { db } from "../db";
import { bankTransactions, type BankTransaction, type BankTransactionInput } from "@shared/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function listBankTransactions(): Promise<BankTransaction[]> {
  return db.select().from(bankTransactions).orderBy(desc(bankTransactions.date));
}

export async function createBankTransaction(data: BankTransactionInput): Promise<BankTransaction> {
  const [row] = await db
    .insert(bankTransactions)
    .values({ ...data, amount: toMoney(data.amount) })
    .returning();
  return row;
}

export async function updateBankTransaction(
  id: number,
  data: Partial<BankTransactionInput>
): Promise<BankTransaction | null> {
  const { amount, ...rest } = data;
  const [row] = await db
    .update(bankTransactions)
    .set({ ...rest, ...(amount !== undefined ? { amount: toMoney(amount) } : {}) })
    .where(eq(bankTransactions.id, id))
    .returning();
  return row ?? null;
}

export async function deleteBankTransaction(id: number): Promise<boolean> {
  const result = await db
    .delete(bankTransactions)
    .where(eq(bankTransactions.id, id))
    .returning({ id: bankTransactions.id });
  return result.length > 0;
}

// Powers the "[Month] deposit completed/pending" status line on the Bank
// screen and Dashboard: a simple existence check, no amount reconciliation.
export async function hasDepositInRange(from: string, to: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bankTransactions.id })
    .from(bankTransactions)
    .where(and(eq(bankTransactions.type, "deposit"), gte(bankTransactions.date, from), lte(bankTransactions.date, to)))
    .limit(1);
  return !!row;
}

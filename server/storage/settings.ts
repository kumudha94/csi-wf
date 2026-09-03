import { db } from "../db";
import { settings, type Settings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function getSettings(): Promise<Settings | null> {
  const [row] = await db.select().from(settings).limit(1);
  return row ?? null;
}

export type OpeningBalanceUpdate = {
  bankOpeningBalance?: number;
  cashOpeningBalance?: number;
};

export async function setOpeningBalances(data: OpeningBalanceUpdate): Promise<Settings> {
  const existing = await getSettings();
  const values: Partial<Pick<Settings, "bankOpeningBalance" | "cashOpeningBalance">> = {};
  if (data.bankOpeningBalance !== undefined) values.bankOpeningBalance = toMoney(data.bankOpeningBalance);
  if (data.cashOpeningBalance !== undefined) values.cashOpeningBalance = toMoney(data.cashOpeningBalance);

  if (existing) {
    const [row] = await db.update(settings).set(values).where(eq(settings.id, existing.id)).returning();
    return row;
  }
  const [row] = await db
    .insert(settings)
    .values({
      bankOpeningBalance: toMoney(data.bankOpeningBalance ?? 0),
      cashOpeningBalance: toMoney(data.cashOpeningBalance ?? 0),
    })
    .returning();
  return row;
}

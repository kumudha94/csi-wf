import { db } from "../db";
import { settings, type Settings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function getSettings(): Promise<Settings | null> {
  const [row] = await db.select().from(settings).limit(1);
  return row ?? null;
}

export async function setOpeningBalance(openingBalance: number): Promise<Settings> {
  const existing = await getSettings();
  if (existing) {
    const [row] = await db
      .update(settings)
      .set({ openingBalance: toMoney(openingBalance) })
      .where(eq(settings.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db.insert(settings).values({ openingBalance: toMoney(openingBalance) }).returning();
  return row;
}

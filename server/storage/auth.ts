import { db } from "../db";
import { authAccount, type AuthAccount } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function getAccount(): Promise<AuthAccount | null> {
  const [account] = await db.select().from(authAccount).limit(1);
  return account ?? null;
}

export async function createAccount(pinHash: string): Promise<AuthAccount> {
  const [account] = await db.insert(authAccount).values({ pinHash }).returning();
  return account;
}

export async function updatePin(id: number, pinHash: string): Promise<AuthAccount> {
  const [account] = await db.update(authAccount).set({ pinHash }).where(eq(authAccount.id, id)).returning();
  return account;
}

import { db } from "../db";
import { contributions, type Contribution, type ContributionInput } from "@shared/schema";
import { eq } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function listContributions(memberId?: number): Promise<Contribution[]> {
  if (memberId !== undefined) {
    return db.select().from(contributions).where(eq(contributions.memberId, memberId));
  }
  return db.select().from(contributions);
}

export async function createContribution(data: ContributionInput): Promise<Contribution> {
  const [contribution] = await db
    .insert(contributions)
    .values({ ...data, amount: toMoney(data.amount) })
    .returning();
  return contribution;
}

export async function updateContribution(id: number, data: Partial<ContributionInput>): Promise<Contribution | null> {
  const { amount, ...rest } = data;
  const [contribution] = await db
    .update(contributions)
    .set({ ...rest, ...(amount !== undefined ? { amount: toMoney(amount) } : {}) })
    .where(eq(contributions.id, id))
    .returning();
  return contribution ?? null;
}

export async function deleteContribution(id: number): Promise<boolean> {
  const result = await db.delete(contributions).where(eq(contributions.id, id)).returning({ id: contributions.id });
  return result.length > 0;
}

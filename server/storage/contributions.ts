import { db } from "../db";
import { contributions, members, type Contribution, type ContributionInput } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { toMoney, fromMoney } from "../lib/money";
import { getMissingMonths, splitAmountAcrossMonths, monthString } from "../lib/contributionMonths";

export async function listContributions(memberId?: number): Promise<Contribution[]> {
  if (memberId !== undefined) {
    return db
      .select()
      .from(contributions)
      .where(eq(contributions.memberId, memberId))
      .orderBy(desc(contributions.date));
  }
  return db.select().from(contributions).orderBy(desc(contributions.date));
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

export type MemberCollectionStatus = {
  memberId: number;
  name: string;
  santhaNumber: string;
  defaultAmount: number;
  paidThisMonth: boolean;
  currentMonthContributionId: number | null;
  currentMonthAmount: number | null;
  currentMonthDate: string | null;
  missingMonths: string[];
};

// Active members only -- inactive/died members don't appear in the
// collection flow. `now` is a parameter (defaulting to the real clock) so
// this is testable without mocking global time.
export async function getCollectionStatus(now: Date = new Date()): Promise<MemberCollectionStatus[]> {
  const yearStart = monthString(new Date(now.getFullYear(), 0, 1));
  const currentMonth = monthString(now);

  const memberRows = await db
    .select({
      id: members.id,
      name: members.name,
      santhaNumber: members.santhaNumber,
      defaultAmount: members.defaultAmount,
      createdAt: members.createdAt,
    })
    .from(members)
    .where(eq(members.status, "active"));

  const contributionRows = await db.select().from(contributions).where(gte(contributions.forMonth, yearStart));

  const byMember = new Map<number, Contribution[]>();
  for (const row of contributionRows) {
    const list = byMember.get(row.memberId) ?? [];
    list.push(row);
    byMember.set(row.memberId, list);
  }

  return memberRows.map((member) => {
    const memberContributions = byMember.get(member.id) ?? [];
    const paidMonths = new Set(memberContributions.map((c) => c.forMonth));
    const missingMonths = getMissingMonths(member.createdAt, now, paidMonths);
    const currentRow = memberContributions.find((c) => c.forMonth === currentMonth) ?? null;

    return {
      memberId: member.id,
      name: member.name,
      santhaNumber: member.santhaNumber,
      defaultAmount: fromMoney(member.defaultAmount),
      paidThisMonth: !!currentRow,
      currentMonthContributionId: currentRow?.id ?? null,
      currentMonthAmount: currentRow ? fromMoney(currentRow.amount) : null,
      currentMonthDate: currentRow?.date ?? null,
      missingMonths,
    };
  });
}

export async function collectContribution(
  memberId: number,
  totalAmount: number,
  date: string
): Promise<Contribution[]> {
  const [member] = await db.select({ createdAt: members.createdAt }).from(members).where(eq(members.id, memberId));
  if (!member) throw new Error("MEMBER_NOT_FOUND");

  const now = new Date();
  const yearStart = monthString(new Date(now.getFullYear(), 0, 1));
  const existingRows = await db
    .select({ forMonth: contributions.forMonth })
    .from(contributions)
    .where(and(eq(contributions.memberId, memberId), gte(contributions.forMonth, yearStart)));
  const paidMonths = new Set(existingRows.map((r) => r.forMonth));

  const missingMonths = getMissingMonths(member.createdAt, now, paidMonths);
  if (missingMonths.length === 0) throw new Error("NOTHING_OWED");

  const splits = splitAmountAcrossMonths(totalAmount, missingMonths);
  const rows = splits.map(({ forMonth, amount }) => ({
    memberId,
    forMonth,
    date,
    amount: toMoney(amount),
    note: null,
  }));

  return db.insert(contributions).values(rows).returning();
}


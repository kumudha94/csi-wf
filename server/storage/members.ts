import { db } from "../db";
import { members, memberAttributeValues, type Member, type MemberInput, type MemberStatus } from "@shared/schema";
import { eq, ilike, or, and, asc, desc, inArray } from "drizzle-orm";
import { toMoney } from "../lib/money";

export type MemberSortField = "santhaNumber" | "name";
export type MemberSortDir = "asc" | "desc";

function sortColumn(sortBy: MemberSortField) {
  return sortBy === "name" ? members.name : members.santhaNumber;
}

export async function listMembers(
  search?: string,
  sortBy: MemberSortField = "santhaNumber",
  sortDir: MemberSortDir = "asc"
): Promise<Member[]> {
  const orderBy = sortDir === "desc" ? desc(sortColumn(sortBy)) : asc(sortColumn(sortBy));
  if (search) {
    return db
      .select()
      .from(members)
      .where(or(ilike(members.name, `%${search}%`), ilike(members.santhaNumber, `%${search}%`)))
      .orderBy(orderBy);
  }
  return db.select().from(members).orderBy(orderBy);
}

export type MemberExportFilter = {
  statuses?: MemberStatus[];
  memberIds?: number[];
  sortBy?: MemberSortField;
  sortDir?: MemberSortDir;
};

// `memberIds` (from the mobile app's member picker) takes precedence over
// `statuses` when both are present — the picker's candidate pool is already
// status-filtered, so the picked ids are already a subset of any status match.
export async function listMembersForExport({
  statuses,
  memberIds,
  sortBy = "santhaNumber",
  sortDir = "asc",
}: MemberExportFilter): Promise<Member[]> {
  const orderBy = sortDir === "desc" ? desc(sortColumn(sortBy)) : asc(sortColumn(sortBy));
  if (memberIds && memberIds.length > 0) {
    return db.select().from(members).where(inArray(members.id, memberIds)).orderBy(orderBy);
  }
  if (statuses && statuses.length > 0) {
    return db.select().from(members).where(inArray(members.status, statuses)).orderBy(orderBy);
  }
  return db.select().from(members).orderBy(orderBy);
}

export async function getMember(id: number) {
  const [member] = await db.select().from(members).where(eq(members.id, id));
  if (!member) return null;
  const attributes = await db
    .select()
    .from(memberAttributeValues)
    .where(eq(memberAttributeValues.memberId, id));
  return { ...member, attributes };
}

export async function createMember(data: MemberInput): Promise<Member> {
  const [member] = await db
    .insert(members)
    .values({ ...data, defaultAmount: toMoney(data.defaultAmount) })
    .returning();
  return member;
}

export async function updateMember(id: number, data: Partial<MemberInput>): Promise<Member | null> {
  const { defaultAmount, ...rest } = data;
  const [member] = await db
    .update(members)
    .set({ ...rest, ...(defaultAmount !== undefined ? { defaultAmount: toMoney(defaultAmount) } : {}), updatedAt: new Date() })
    .where(eq(members.id, id))
    .returning();
  return member ?? null;
}

export async function deleteMember(id: number): Promise<boolean> {
  const result = await db.delete(members).where(eq(members.id, id)).returning({ id: members.id });
  return result.length > 0;
}

export async function setMemberAttributeValue(memberId: number, attributeKey: string, value: string) {
  const [existing] = await db
    .select()
    .from(memberAttributeValues)
    .where(and(eq(memberAttributeValues.memberId, memberId), eq(memberAttributeValues.attributeKey, attributeKey)));
  if (existing) {
    const [updated] = await db
      .update(memberAttributeValues)
      .set({ value })
      .where(eq(memberAttributeValues.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(memberAttributeValues)
    .values({ memberId, attributeKey, value })
    .returning();
  return created;
}

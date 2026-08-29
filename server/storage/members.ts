import { db } from "../db";
import { members, memberAttributeValues, type Member, type MemberInput } from "@shared/schema";
import { eq, ilike, or, and } from "drizzle-orm";

export async function listMembers(search?: string): Promise<Member[]> {
  if (search) {
    return db
      .select()
      .from(members)
      .where(or(ilike(members.name, `%${search}%`), ilike(members.santhaNumber, `%${search}%`)));
  }
  return db.select().from(members);
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
  const [member] = await db.insert(members).values(data).returning();
  return member;
}

export async function updateMember(id: number, data: Partial<MemberInput>): Promise<Member | null> {
  const [member] = await db
    .update(members)
    .set({ ...data, updatedAt: new Date() })
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

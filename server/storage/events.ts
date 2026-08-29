import { db } from "../db";
import { events, expenses, type Event, type EventInput } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { fromMoney } from "../lib/money";

export async function listEvents() {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      details: events.details,
      createdAt: events.createdAt,
      totalPaid: sql<string>`coalesce(sum(${expenses.amount}) filter (where ${expenses.status} = 'paid'), 0)`,
    })
    .from(events)
    .leftJoin(expenses, eq(expenses.eventId, events.id))
    .groupBy(events.id);
  return rows.map((row) => ({ ...row, totalPaid: fromMoney(row.totalPaid) }));
}

export async function getEvent(id: number): Promise<Event | null> {
  const [event] = await db.select().from(events).where(eq(events.id, id));
  return event ?? null;
}

export async function createEvent(data: EventInput): Promise<Event> {
  const [event] = await db.insert(events).values(data).returning();
  return event;
}

export async function updateEvent(id: number, data: Partial<EventInput>): Promise<Event | null> {
  const [event] = await db.update(events).set(data).where(eq(events.id, id)).returning();
  return event ?? null;
}

export async function deleteEvent(id: number): Promise<boolean> {
  const result = await db.delete(events).where(eq(events.id, id)).returning({ id: events.id });
  return result.length > 0;
}

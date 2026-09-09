import { db } from "../db";
import {
  events,
  expenses,
  bankTransactions,
  cashFundIncome,
  cashFundExpenses,
  type Event,
  type EventInput,
  type EventFundTarget,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { fromMoney, toMoney } from "../lib/money";
import { todayDateString } from "../lib/dateRange";

export type EventWithFundSummary = Event & {
  totalPaid: number;
  eventFundCollected: number;
  eventFundRemaining: number;
  hasExpenses: boolean;
};

const FUND_TOTALS_SELECT = {
  totalPaid: sql<string>`coalesce(sum(${expenses.amount}) filter (where ${expenses.status} = 'paid' and ${expenses.txnType} = 'debit'), 0)`,
  eventFundCollected: sql<string>`coalesce(sum(${expenses.amount}) filter (where ${expenses.status} = 'paid' and ${expenses.txnType} = 'credit'), 0)`,
  // Any row at all, paid or pending -- this is what locks the hasEventFund
  // toggle, not just the paid totals above.
  expenseCount: sql<number>`count(${expenses.id})::int`,
};

function withFundSummary<T extends { totalPaid: string; eventFundCollected: string; expenseCount: number }>(row: T) {
  const totalPaid = fromMoney(row.totalPaid);
  const eventFundCollected = fromMoney(row.eventFundCollected);
  const { expenseCount, ...rest } = row;
  return {
    ...rest,
    totalPaid,
    eventFundCollected,
    eventFundRemaining: Math.round((eventFundCollected - totalPaid) * 100) / 100,
    hasExpenses: expenseCount > 0,
  };
}

export async function listEvents(): Promise<EventWithFundSummary[]> {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      details: events.details,
      eventDate: events.eventDate,
      hasEventFund: events.hasEventFund,
      fundTransferredTo: events.fundTransferredTo,
      fundTransferredAt: events.fundTransferredAt,
      createdAt: events.createdAt,
      ...FUND_TOTALS_SELECT,
    })
    .from(events)
    .leftJoin(expenses, eq(expenses.eventId, events.id))
    .groupBy(events.id)
    .orderBy(events.name);
  return rows.map(withFundSummary) as EventWithFundSummary[];
}

export async function getEvent(id: number): Promise<EventWithFundSummary | null> {
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) return null;
  const [totals] = await db.select(FUND_TOTALS_SELECT).from(expenses).where(eq(expenses.eventId, id));
  return withFundSummary({ ...event, ...totals }) as EventWithFundSummary;
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

class EventFundActionError extends Error {}

/**
 * Moves an eventFund event's leftover collection into BankFund or CashFund.
 * Full amount only, and permanent: records `fundTransferredTo`/`fundTransferredAt`
 * so the UI stops offering this once done. Zeroes the event's own remaining
 * via a matching debit row so its own ledger stays internally consistent.
 */
export async function transferEventFundSurplus(id: number, target: EventFundTarget): Promise<Event> {
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, id));
    if (!event) throw new EventFundActionError("Event not found");
    if (!event.hasEventFund) throw new EventFundActionError("This event does not track a separate fund");
    if (event.fundTransferredTo) throw new EventFundActionError("This event's fund has already been settled");

    const [totals] = await tx.select(FUND_TOTALS_SELECT).from(expenses).where(eq(expenses.eventId, id));
    const remaining =
      Math.round((fromMoney(totals.eventFundCollected) - fromMoney(totals.totalPaid)) * 100) / 100;
    if (remaining <= 0) throw new EventFundActionError("There is no surplus to transfer");

    const today = todayDateString();
    const fundLabel = target === "bank" ? "BankFund" : "CashFund";

    await tx.insert(expenses).values({
      eventId: id,
      description: `Transferred to ${fundLabel}`,
      amount: toMoney(remaining),
      status: "paid",
      fundSource: "eventFund",
      txnType: "debit",
      date: today,
    });

    if (target === "bank") {
      await tx.insert(bankTransactions).values({
        type: "deposit",
        description: `Event fund transfer: ${event.name}`,
        amount: toMoney(remaining),
        date: today,
      });
    } else {
      await tx.insert(cashFundIncome).values({
        type: "offering",
        amount: toMoney(remaining),
        date: today,
        note: `Event fund transfer: ${event.name}`,
      });
    }

    const [updated] = await tx
      .update(events)
      .set({ fundTransferredTo: target, fundTransferredAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return updated;
  });
}

/**
 * Covers an eventFund event's shortfall by pulling the deficit out of
 * BankFund or CashFund. Unlike the surplus transfer, this doesn't lock the
 * event -- if more expenses push it back into deficit, it can be covered
 * again, so no `fundTransferredTo` is set here.
 */
export async function coverEventFundShortfall(id: number, source: EventFundTarget): Promise<Event> {
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, id));
    if (!event) throw new EventFundActionError("Event not found");
    if (!event.hasEventFund) throw new EventFundActionError("This event does not track a separate fund");
    if (event.fundTransferredTo) throw new EventFundActionError("This event's fund has already been settled");

    const [totals] = await tx.select(FUND_TOTALS_SELECT).from(expenses).where(eq(expenses.eventId, id));
    const remaining =
      Math.round((fromMoney(totals.eventFundCollected) - fromMoney(totals.totalPaid)) * 100) / 100;
    if (remaining >= 0) throw new EventFundActionError("There is no shortfall to cover");
    const shortfall = Math.abs(remaining);

    const today = todayDateString();
    const fundLabel = source === "bank" ? "BankFund" : "CashFund";

    await tx.insert(expenses).values({
      eventId: id,
      description: `Covered from ${fundLabel}`,
      amount: toMoney(shortfall),
      status: "paid",
      fundSource: "eventFund",
      txnType: "credit",
      date: today,
    });

    if (source === "bank") {
      await tx.insert(bankTransactions).values({
        type: "withdrawal",
        description: `Event fund shortfall cover: ${event.name}`,
        amount: toMoney(shortfall),
        date: today,
      });
    } else {
      await tx.insert(cashFundExpenses).values({
        description: `Event fund shortfall cover: ${event.name}`,
        amount: toMoney(shortfall),
        date: today,
      });
    }

    const [updated] = await tx.select().from(events).where(eq(events.id, id));
    return updated;
  });
}

export { EventFundActionError };

import { db } from "../db";
import { contributions, expenses, events, cashFundIncome, cashFundExpenses } from "@shared/schema";
import { sql, and, gte, lte, lt, eq } from "drizzle-orm";

export type ReportRange = { from: string; to: string };

export async function getReportTotals({ from, to }: ReportRange) {
  const [contribRow] = await db
    .select({ total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
    .from(contributions)
    .where(and(gte(contributions.date, from), lte(contributions.date, to)));

  const [paidRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(gte(expenses.date, from), lte(expenses.date, to), eq(expenses.status, "paid")));

  const [pendingRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(gte(expenses.date, from), lte(expenses.date, to), eq(expenses.status, "pending")));

  return {
    totalContributions: contribRow.total,
    totalPaidExpenses: paidRow.total,
    totalPendingExpenses: pendingRow.total,
  };
}

/**
 * Everything that happened strictly BEFORE `before`, so a dated report can roll
 * the all-time opening balance forward to the start of its range instead of
 * pretending the range begins at the ledger's inception.
 *
 * `date` is a varchar 'YYYY-MM-DD', so a lexicographic `<` is also a
 * chronological one. Pending expenses are deliberately absent: they never move
 * a balance anywhere in this app.
 */
export async function getPriorActivity(before: string) {
  const [contribRow] = await db
    .select({ total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
    .from(contributions)
    .where(lt(contributions.date, before));

  const [paidRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(lt(expenses.date, before), eq(expenses.status, "paid")));

  return {
    totalContributions: contribRow.total,
    totalPaidExpenses: paidRow.total,
  };
}

export async function getExpensesByEvent({ from, to }: ReportRange) {
  return db
    .select({
      eventName: events.name,
      description: expenses.description,
      amount: expenses.amount,
      status: expenses.status,
      date: expenses.date,
    })
    .from(expenses)
    .leftJoin(events, eq(expenses.eventId, events.id))
    .where(and(gte(expenses.date, from), lte(expenses.date, to)))
    .orderBy(expenses.date);
}

export async function getContributionsInRange({ from, to }: ReportRange) {
  return db
    .select()
    .from(contributions)
    .where(and(gte(contributions.date, from), lte(contributions.date, to)))
    .orderBy(contributions.date);
}

export async function getCashReportTotals({ from, to }: ReportRange) {
  const [incomeRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(and(gte(cashFundIncome.date, from), lte(cashFundIncome.date, to)));

  const [offeringRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(and(gte(cashFundIncome.date, from), lte(cashFundIncome.date, to), eq(cashFundIncome.type, "offering")));

  const [donationRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(and(gte(cashFundIncome.date, from), lte(cashFundIncome.date, to), eq(cashFundIncome.type, "donation")));

  const [expenseRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundExpenses.amount}), 0)` })
    .from(cashFundExpenses)
    .where(and(gte(cashFundExpenses.date, from), lte(cashFundExpenses.date, to)));

  return {
    totalCashIncome: incomeRow.total,
    totalOffering: offeringRow.total,
    totalDonation: donationRow.total,
    totalCashExpenses: expenseRow.total,
  };
}

// Mirrors getPriorActivity() above, for the Cash Fund's rolling opening balance.
export async function getCashPriorActivity(before: string) {
  const [incomeRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(lt(cashFundIncome.date, before));

  const [expenseRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundExpenses.amount}), 0)` })
    .from(cashFundExpenses)
    .where(lt(cashFundExpenses.date, before));

  return { totalCashIncome: incomeRow.total, totalCashExpenses: expenseRow.total };
}

export async function getCashFundEntriesInRange({ from, to }: ReportRange) {
  const income = await db
    .select()
    .from(cashFundIncome)
    .where(and(gte(cashFundIncome.date, from), lte(cashFundIncome.date, to)))
    .orderBy(cashFundIncome.date);

  const expenseRows = await db
    .select()
    .from(cashFundExpenses)
    .where(and(gte(cashFundExpenses.date, from), lte(cashFundExpenses.date, to)))
    .orderBy(cashFundExpenses.date);

  return { income, expenses: expenseRows };
}

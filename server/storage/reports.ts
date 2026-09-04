import { db } from "../db";
import { contributions, expenses, events, cashFundIncome, cashFundExpenses, bankTransactions } from "@shared/schema";
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

// Event expenses logged with fundSource "cash" come out of the Cash Fund,
// same as a meeting expense -- this totals just those, in range, paid only
// (mirrors how pending expenses never move a balance anywhere in this app).
async function getCashSourcedEventExpensesTotal(from: string, to: string) {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(
      and(eq(expenses.fundSource, "cash"), eq(expenses.status, "paid"), gte(expenses.date, from), lte(expenses.date, to))
    );
  return row.total;
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

  const totalCashEventExpenses = await getCashSourcedEventExpensesTotal(from, to);

  return {
    totalCashIncome: incomeRow.total,
    totalOffering: offeringRow.total,
    totalDonation: donationRow.total,
    totalCashExpenses: expenseRow.total,
    totalCashEventExpenses,
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

  const [eventExpenseRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(eq(expenses.fundSource, "cash"), eq(expenses.status, "paid"), lt(expenses.date, before)));

  return {
    totalCashIncome: incomeRow.total,
    totalCashExpenses: expenseRow.total,
    totalCashEventExpenses: eventExpenseRow.total,
  };
}

// Cash-sourced event expenses, shaped to match cashFundExpenses rows
// exactly (id/description/amount/date/createdAt) so they merge directly
// into the same ledger list -- description gets an "[Event Name]" prefix,
// same convention as the Bank Fund ledger's event expense rows.
async function getCashSourcedEventExpensesInRange({ from, to }: ReportRange) {
  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      date: expenses.date,
      createdAt: expenses.createdAt,
      eventName: events.name,
    })
    .from(expenses)
    .leftJoin(events, eq(expenses.eventId, events.id))
    .where(
      and(eq(expenses.fundSource, "cash"), eq(expenses.status, "paid"), gte(expenses.date, from), lte(expenses.date, to))
    )
    .orderBy(expenses.date);

  return rows.map((r) => ({
    id: r.id,
    description: r.eventName ? `[${r.eventName}] ${r.description}` : r.description,
    amount: r.amount,
    date: r.date,
    createdAt: r.createdAt,
  }));
}

export async function getCashFundEntriesInRange({ from, to }: ReportRange) {
  const income = await db
    .select()
    .from(cashFundIncome)
    .where(and(gte(cashFundIncome.date, from), lte(cashFundIncome.date, to)))
    .orderBy(cashFundIncome.date);

  const directExpenseRows = await db
    .select()
    .from(cashFundExpenses)
    .where(and(gte(cashFundExpenses.date, from), lte(cashFundExpenses.date, to)))
    .orderBy(cashFundExpenses.date);
  const eventExpenseRows = await getCashSourcedEventExpensesInRange({ from, to });
  const expenseRows = [...directExpenseRows, ...eventExpenseRows].sort((a, b) => a.date.localeCompare(b.date));

  return { income, expenses: expenseRows };
}

// ---------- Bank Fund report (deposit/withdrawal/balance-in-hand model) ----------
// Deliberately independent of getReportTotals()/getPriorActivity() above,
// which still serve the combined report's deferred contributions/expenses
// formula (kept as-is, per the decision to leave that alone until Reports'
// own redesign phase). This is the *correct*, current Bank Fund model, used
// only by the new bank-fund-only report endpoint.

async function sumBankTransactions(type: "deposit" | "withdrawal" | "cash_expense", range: { before?: string; from?: string; to?: string }) {
  const dateFilter = range.before !== undefined ? lt(bankTransactions.date, range.before) : and(gte(bankTransactions.date, range.from!), lte(bankTransactions.date, range.to!));
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${bankTransactions.amount}), 0)` })
    .from(bankTransactions)
    .where(and(eq(bankTransactions.type, type), dateFilter));
  return row.total;
}

async function sumBankSourcedEventExpenses(range: { before?: string; from?: string; to?: string }) {
  const dateFilter = range.before !== undefined ? lt(expenses.date, range.before) : and(gte(expenses.date, range.from!), lte(expenses.date, range.to!));
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(eq(expenses.fundSource, "bank"), eq(expenses.status, "paid"), dateFilter));
  return row.total;
}

export async function getBankFundPriorActivity(before: string) {
  return {
    totalDeposits: await sumBankTransactions("deposit", { before }),
    totalWithdrawals: await sumBankTransactions("withdrawal", { before }),
    totalCashExpenseFromHand: await sumBankTransactions("cash_expense", { before }),
    totalEventExpensesPaidFromBank: await sumBankSourcedEventExpenses({ before }),
  };
}

export async function getBankFundReportTotals({ from, to }: ReportRange) {
  return {
    totalDeposits: await sumBankTransactions("deposit", { from, to }),
    totalWithdrawals: await sumBankTransactions("withdrawal", { from, to }),
    totalCashExpenseFromHand: await sumBankTransactions("cash_expense", { from, to }),
    totalEventExpensesPaidFromBank: await sumBankSourcedEventExpenses({ from, to }),
  };
}

export async function getBankTransactionsInRange({ from, to }: ReportRange) {
  return db
    .select()
    .from(bankTransactions)
    .where(and(gte(bankTransactions.date, from), lte(bankTransactions.date, to)))
    .orderBy(bankTransactions.date);
}

export async function getBankSourcedEventExpensesInRange({ from, to }: ReportRange) {
  return db
    .select({
      eventName: events.name,
      description: expenses.description,
      amount: expenses.amount,
      date: expenses.date,
    })
    .from(expenses)
    .leftJoin(events, eq(expenses.eventId, events.id))
    .where(
      and(eq(expenses.fundSource, "bank"), eq(expenses.status, "paid"), gte(expenses.date, from), lte(expenses.date, to))
    )
    .orderBy(expenses.date);
}

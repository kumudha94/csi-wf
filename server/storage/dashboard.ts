import { db } from "../db";
import { members, contributions, cashFundIncome, type MemberStatus } from "@shared/schema";
import { sql, gte, lte, and, eq } from "drizzle-orm";
import { fromMoney } from "../lib/money";
import { computeBalance } from "../lib/balance";
import { getBalanceInputs } from "./balance";
import { getMonthLabel, getMonthRange, getMonthStart, getWeekOfMonthRange } from "../lib/dateRange";

export async function getDashboardSummary() {
  const now = new Date();
  const monthLabel = getMonthLabel(now);
  const monthRange = getMonthRange(now);
  const weekRange = getWeekOfMonthRange(now);
  const monthStart = getMonthStart(now);

  const balanceInputs = await getBalanceInputs();
  const bankBalance = computeBalance({
    openingBalance: balanceInputs.bankOpeningBalance,
    totalContributions: balanceInputs.totalContributions,
    totalPaidExpenses: balanceInputs.totalPaidExpenses,
  });
  const cashBalance = computeBalance({
    openingBalance: balanceInputs.cashOpeningBalance,
    totalContributions: balanceInputs.totalCashIncome,
    totalPaidExpenses: balanceInputs.totalCashExpenses,
  });

  const statusCounts = await db
    .select({ status: members.status, count: sql<number>`count(*)::int` })
    .from(members)
    .groupBy(members.status);
  const countByStatus = Object.fromEntries(statusCounts.map((row) => [row.status, row.count])) as Record<
    MemberStatus,
    number
  >;

  const [{ count: newThisMonth }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(members)
    .where(gte(members.createdAt, monthStart));

  const [contribMonth] = await db
    .select({ total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
    .from(contributions)
    .where(and(gte(contributions.date, monthRange.from), lte(contributions.date, monthRange.to)));
  const [contribWeek] = await db
    .select({ total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
    .from(contributions)
    .where(and(gte(contributions.date, weekRange.from), lte(contributions.date, weekRange.to)));

  const [offeringMonth] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(
      and(eq(cashFundIncome.type, "offering"), gte(cashFundIncome.date, monthRange.from), lte(cashFundIncome.date, monthRange.to))
    );
  const [offeringWeek] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(
      and(eq(cashFundIncome.type, "offering"), gte(cashFundIncome.date, weekRange.from), lte(cashFundIncome.date, weekRange.to))
    );
  const [offeringTotal] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(eq(cashFundIncome.type, "offering"));

  return {
    monthLabel,
    weekOfMonth: weekRange.weekNumber,
    bank: { balance: bankBalance, pending: balanceInputs.totalPendingExpenses },
    cash: { balance: cashBalance },
    members: {
      total: statusCounts.reduce((sum, row) => sum + row.count, 0),
      active: countByStatus.active ?? 0,
      inactive: countByStatus.inactive ?? 0,
      died: countByStatus.died ?? 0,
      newThisMonth,
    },
    contributions: {
      thisMonth: fromMoney(contribMonth.total),
      thisWeek: fromMoney(contribWeek.total),
      total: balanceInputs.totalContributions,
    },
    offering: {
      thisMonth: fromMoney(offeringMonth.total),
      thisWeek: fromMoney(offeringWeek.total),
      total: fromMoney(offeringTotal.total),
    },
  };
}

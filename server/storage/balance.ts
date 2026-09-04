import { db } from "../db";
import { bankTransactions, expenses, settings, cashFundIncome, cashFundExpenses } from "@shared/schema";
import { sql, eq, isNotNull, and } from "drizzle-orm";
import { fromMoney } from "../lib/money";

export type BalanceInputs = {
  bankOpeningBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalCashExpenseFromHand: number;
  totalEventExpensesPaid: number;
  cashOpeningBalance: number;
  totalCashIncome: number;
  totalOffering: number;
  totalDonation: number;
  totalCashExpenses: number;
};

export async function getBalanceInputs(): Promise<BalanceInputs> {
  const [settingsRow] = await db.select().from(settings).limit(1);
  const bankOpeningBalance = settingsRow ? fromMoney(settingsRow.bankOpeningBalance) : 0;
  const cashOpeningBalance = settingsRow ? fromMoney(settingsRow.cashOpeningBalance) : 0;

  const [depositRow] = await db
    .select({ total: sql<string>`coalesce(sum(${bankTransactions.amount}), 0)` })
    .from(bankTransactions)
    .where(eq(bankTransactions.type, "deposit"));
  const totalDeposits = fromMoney(depositRow.total);

  const [withdrawalRow] = await db
    .select({ total: sql<string>`coalesce(sum(${bankTransactions.amount}), 0)` })
    .from(bankTransactions)
    .where(eq(bankTransactions.type, "withdrawal"));
  const totalWithdrawals = fromMoney(withdrawalRow.total);

  const [cashExpenseFromHandRow] = await db
    .select({ total: sql<string>`coalesce(sum(${bankTransactions.amount}), 0)` })
    .from(bankTransactions)
    .where(eq(bankTransactions.type, "cash_expense"));
  const totalCashExpenseFromHand = fromMoney(cashExpenseFromHandRow.total);

  // Event spending is always funded from withdrawn cash-in-hand, never paid
  // directly from the bank -- so paid event expenses reduce Balance in
  // Hand, not Bank Balance. `event_id IS NOT NULL` is defensive: no new
  // eventId-null ("general") expense rows get created after this ships,
  // but this guards against any stray ones.
  const [eventExpensesPaidRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(isNotNull(expenses.eventId), eq(expenses.status, "paid")));
  const totalEventExpensesPaid = fromMoney(eventExpensesPaidRow.total);

  const [cashIncomeRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome);
  const totalCashIncome = fromMoney(cashIncomeRow.total);

  const [offeringRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(eq(cashFundIncome.type, "offering"));
  const totalOffering = fromMoney(offeringRow.total);

  const [donationRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(eq(cashFundIncome.type, "donation"));
  const totalDonation = fromMoney(donationRow.total);

  const [cashExpenseRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundExpenses.amount}), 0)` })
    .from(cashFundExpenses);
  const totalCashExpenses = fromMoney(cashExpenseRow.total);

  return {
    bankOpeningBalance,
    totalDeposits,
    totalWithdrawals,
    totalCashExpenseFromHand,
    totalEventExpensesPaid,
    cashOpeningBalance,
    totalCashIncome,
    totalOffering,
    totalDonation,
    totalCashExpenses,
  };
}


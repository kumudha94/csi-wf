import { Router } from "express";
import { z } from "zod";
import { wrap } from "../lib/asyncHandler";
import * as reportsStorage from "../storage/reports";
import { getSettings } from "../storage/settings";
import { fromMoney } from "../lib/money";
import { computeBalance } from "../lib/balance";
import { generateReportPdf } from "../lib/pdf";
import { db } from "../db";
import { members } from "@shared/schema";

export const reportsRouter = Router();

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
});

async function buildReport(from: string, to: string) {
  const totals = await reportsStorage.getReportTotals({ from, to });
  const settingsRow = await getSettings();

  // `settings.openingBalance` is the balance at the ledger's inception, which
  // is only this report's opening balance when `from` is that inception. For
  // any later range, roll it forward through everything that happened before
  // `from` — otherwise the closing balance silently omits all of that history.
  const inceptionBalance = settingsRow ? fromMoney(settingsRow.bankOpeningBalance) : 0;
  const prior = await reportsStorage.getPriorActivity(from);
  const openingBalance = computeBalance({
    openingBalance: inceptionBalance,
    totalContributions: fromMoney(prior.totalContributions),
    totalPaidExpenses: fromMoney(prior.totalPaidExpenses),
  });

  const totalContributions = fromMoney(totals.totalContributions);
  const totalPaidExpenses = fromMoney(totals.totalPaidExpenses);
  const totalPendingExpenses = fromMoney(totals.totalPendingExpenses);
  const closingBalance = computeBalance({ openingBalance, totalContributions, totalPaidExpenses });

  const expenseRows = await reportsStorage.getExpensesByEvent({ from, to });
  const contributionRows = await reportsStorage.getContributionsInRange({ from, to });

  const memberRows = await db.select({ id: members.id, name: members.name }).from(members);
  const memberNameById = new Map(memberRows.map((m) => [m.id, m.name]));

  const cashInceptionBalance = settingsRow ? fromMoney(settingsRow.cashOpeningBalance) : 0;
  const cashPrior = await reportsStorage.getCashPriorActivity(from);
  const cashOpeningBalance = computeBalance({
    openingBalance: cashInceptionBalance,
    totalContributions: fromMoney(cashPrior.totalCashIncome),
    totalPaidExpenses: fromMoney(cashPrior.totalCashExpenses),
  });

  const cashTotals = await reportsStorage.getCashReportTotals({ from, to });
  const totalCashIncome = fromMoney(cashTotals.totalCashIncome);
  const totalOffering = fromMoney(cashTotals.totalOffering);
  const totalDonation = fromMoney(cashTotals.totalDonation);
  const totalCashExpenses = fromMoney(cashTotals.totalCashExpenses);
  const cashClosingBalance = computeBalance({
    openingBalance: cashOpeningBalance,
    totalContributions: totalCashIncome,
    totalPaidExpenses: totalCashExpenses,
  });

  const cashEntries = await reportsStorage.getCashFundEntriesInRange({ from, to });

  return {
    from,
    to,
    openingBalance,
    totalContributions,
    totalPaidExpenses,
    totalPendingExpenses,
    closingBalance,
    expenses: expenseRows,
    contributions: contributionRows.map((c) => ({
      memberName: memberNameById.get(c.memberId) ?? "Unknown",
      amount: c.amount,
      date: c.date,
      note: c.note,
    })),
    cashFund: {
      openingBalance: cashOpeningBalance,
      totalIncome: totalCashIncome,
      totalOffering,
      totalDonation,
      totalExpenses: totalCashExpenses,
      closingBalance: cashClosingBalance,
      income: cashEntries.income,
      expenses: cashEntries.expenses,
    },
  };
}

reportsRouter.get(
  "/",
  wrap(async (req, res) => {
    const { from, to } = rangeSchema.parse(req.query);
    const report = await buildReport(from, to);
    // buildReport's expenses/contributions arrays keep amount as the raw
    // numeric-column string (that's what generateReportPdf below expects) —
    // convert to plain numbers here so this JSON response matches every
    // other endpoint's contract.
    res.json({
      ...report,
      expenses: report.expenses.map((e) => ({ ...e, amount: fromMoney(e.amount) })),
      contributions: report.contributions.map((c) => ({ ...c, amount: fromMoney(c.amount) })),
      cashFund: {
        ...report.cashFund,
        income: report.cashFund.income.map((i) => ({ ...i, amount: fromMoney(i.amount) })),
        expenses: report.cashFund.expenses.map((e) => ({ ...e, amount: fromMoney(e.amount) })),
      },
    });
  })
);

reportsRouter.get(
  "/pdf",
  wrap(async (req, res) => {
    const { from, to } = rangeSchema.parse(req.query);
    const report = await buildReport(from, to);
    const pdfBuffer = await generateReportPdf(report);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="csi-wf-report-${from}-to-${to}.pdf"`);
    res.send(pdfBuffer);
  })
);

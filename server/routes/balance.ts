import { Router } from "express";
import { wrap } from "../lib/asyncHandler";
import { getBalanceInputs } from "../storage/balance";
import { computeBalance } from "../lib/balance";

export const balanceRouter = Router();

balanceRouter.get(
  "/",
  wrap(async (_req, res) => {
    const inputs = await getBalanceInputs();

    const bankBalance = computeBalance({
      openingBalance: inputs.bankOpeningBalance,
      totalContributions: inputs.totalContributions,
      totalPaidExpenses: inputs.totalPaidExpenses,
    });
    // Cash Fund has no pending-expense concept, so this reuses the exact
    // same formula shape with cash income/expenses in place of
    // contributions/paid-expenses.
    const cashBalance = computeBalance({
      openingBalance: inputs.cashOpeningBalance,
      totalContributions: inputs.totalCashIncome,
      totalPaidExpenses: inputs.totalCashExpenses,
    });

    res.json({
      bankFund: {
        openingBalance: inputs.bankOpeningBalance,
        totalContributions: inputs.totalContributions,
        totalPaidExpenses: inputs.totalPaidExpenses,
        totalPendingExpenses: inputs.totalPendingExpenses,
        balance: bankBalance,
      },
      cashFund: {
        openingBalance: inputs.cashOpeningBalance,
        totalIncome: inputs.totalCashIncome,
        totalExpenses: inputs.totalCashExpenses,
        balance: cashBalance,
      },
    });
  })
);

import { Router } from "express";
import { wrap } from "../lib/asyncHandler";
import { getBalanceInputs } from "../storage/balance";
import { hasDepositInRange } from "../storage/bankTransactions";
import { computeBalance } from "../lib/balance";
import { getDepositWindow, getMonthLabel } from "../lib/dateRange";

export const balanceRouter = Router();

balanceRouter.get(
  "/",
  wrap(async (_req, res) => {
    const inputs = await getBalanceInputs();

    const bankBalance = computeBalance({
      openingBalance: inputs.bankOpeningBalance,
      totalContributions: inputs.totalDeposits,
      totalPaidExpenses: inputs.totalWithdrawals,
    });
    const balanceInHand = computeBalance({
      openingBalance: 0,
      totalContributions: inputs.totalWithdrawals,
      totalPaidExpenses: inputs.totalCashExpenseFromHand + inputs.totalEventExpensesPaidFromBank,
    });
    // Event expenses can also be paid from the Cash Fund (fundSource
    // "cash"), so those reduce Cash Fund balance the same way meeting
    // expenses do.
    const cashBalance = computeBalance({
      openingBalance: inputs.cashOpeningBalance,
      totalContributions: inputs.totalCashIncome,
      totalPaidExpenses: inputs.totalCashExpenses + inputs.totalEventExpensesPaidFromCash,
    });

    const now = new Date();
    const depositWindow = getDepositWindow(now);
    const depositCompleted = await hasDepositInRange(depositWindow.from, depositWindow.to);

    res.json({
      bankFund: {
        openingBalance: inputs.bankOpeningBalance,
        totalDeposits: inputs.totalDeposits,
        totalWithdrawals: inputs.totalWithdrawals,
        balance: bankBalance,
        balanceInHand,
        depositStatus: { monthLabel: getMonthLabel(now), completed: depositCompleted },
      },
      cashFund: {
        openingBalance: inputs.cashOpeningBalance,
        totalIncome: inputs.totalCashIncome,
        totalOffering: inputs.totalOffering,
        totalDonation: inputs.totalDonation,
        totalExpenses: inputs.totalCashExpenses,
        balance: cashBalance,
      },
    });
  })
);


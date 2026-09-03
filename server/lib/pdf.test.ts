import { describe, it, expect } from "vitest";
import { buildCashLedgerRows, type ReportPdfData } from "./pdf";

type CashFundData = ReportPdfData["cashFund"];

function makeCashFund(overrides: Partial<CashFundData> = {}): CashFundData {
  return {
    openingBalance: 0,
    totalIncome: 0,
    totalOffering: 0,
    totalDonation: 0,
    totalExpenses: 0,
    closingBalance: 0,
    income: [],
    expenses: [],
    ...overrides,
  };
}

describe("buildCashLedgerRows", () => {
  it("subtracts a debit from the running balance unconditionally (no status check)", () => {
    // Cash Fund expenses have no paid/pending status — unlike the Bank Fund
    // ledger, every debit reduces the running balance immediately.
    const data = makeCashFund({
      openingBalance: 1000,
      income: [{ type: "offering", amount: "500.00", date: "2026-09-01", donorName: null, note: null }],
      expenses: [{ description: "Tea and biscuits", amount: "200.00", date: "2026-09-02" }],
    });

    const rows = buildCashLedgerRows(data);

    expect(rows).toHaveLength(2);
    const expenseRow = rows[1];
    expect(expenseRow.debit).toBe(200);
    // 1000 opening + 500 income - 200 expense, with no status filtering applied.
    expect(expenseRow.balance).toBe(1300);
  });

  it("applies income before expense on the same date (order field tie-break)", () => {
    const data = makeCashFund({
      openingBalance: 100,
      income: [{ type: "donation", amount: "50.00", date: "2026-09-01", donorName: "Grace Devi", note: null }],
      expenses: [{ description: "Auto fare", amount: "30.00", date: "2026-09-01" }],
    });

    const rows = buildCashLedgerRows(data);

    expect(rows).toHaveLength(2);
    const [incomeRow, expenseRow] = rows;
    expect(incomeRow.credit).toBe(50);
    // Income applied first: 100 + 50 = 150.
    expect(incomeRow.balance).toBe(150);
    expect(expenseRow.debit).toBe(30);
    // Expense applied after: 150 - 30 = 120.
    expect(expenseRow.balance).toBe(120);
  });
});

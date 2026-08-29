import { describe, it, expect } from "vitest";
import { computeBalance } from "./balance";

describe("computeBalance", () => {
  it("adds opening balance and contributions, subtracts only paid expenses", () => {
    expect(
      computeBalance({ openingBalance: 1000, totalContributions: 500, totalPaidExpenses: 300 })
    ).toBe(1200);
  });

  it("returns the opening balance when there is no activity", () => {
    expect(computeBalance({ openingBalance: 250, totalContributions: 0, totalPaidExpenses: 0 })).toBe(250);
  });

  it("can go negative if expenses exceed income", () => {
    expect(computeBalance({ openingBalance: 0, totalContributions: 100, totalPaidExpenses: 300 })).toBe(-200);
  });

  it("rounds floating-point drift to 2 decimal places", () => {
    expect(computeBalance({ openingBalance: 0.1, totalContributions: 0.2, totalPaidExpenses: 0 })).toBe(0.3);
  });
});

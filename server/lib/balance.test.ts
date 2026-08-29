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

// A dated report's opening balance is the inception balance rolled forward
// through everything before `from`; its closing balance then applies only the
// in-range activity to that. This is the composition buildReport() performs.
describe("report opening/closing balance for a non-inception range", () => {
  const rollForward = (inception: number, priorContributions: number, priorPaidExpenses: number) =>
    computeBalance({
      openingBalance: inception,
      totalContributions: priorContributions,
      totalPaidExpenses: priorPaidExpenses,
    });

  it("rolls the inception balance forward to the start of the range", () => {
    // Inception 1000; before Jan 1: +500 contributed, -200 paid.
    const opening = rollForward(1000, 500, 200);
    expect(opening).toBe(1300);

    // In January: +300 contributed, -100 paid.
    const closing = computeBalance({
      openingBalance: opening,
      totalContributions: 300,
      totalPaidExpenses: 100,
    });
    expect(closing).toBe(1500);
  });

  it("is unchanged from the old behaviour when the range starts at inception", () => {
    // No activity before `from` — opening stays the raw settings value.
    expect(rollForward(1000, 0, 0)).toBe(1000);
  });

  it("keeps 2-decimal rounding across both steps", () => {
    const opening = rollForward(0.1, 0.2, 0);
    expect(opening).toBe(0.3);
    expect(computeBalance({ openingBalance: opening, totalContributions: 0.1, totalPaidExpenses: 0 })).toBe(0.4);
  });
});

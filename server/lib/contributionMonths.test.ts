import { describe, it, expect } from "vitest";
import { getMissingMonths, splitAmountAcrossMonths, monthString } from "./contributionMonths";

describe("monthString", () => {
  it("formats a date as the 1st of its month", () => {
    expect(monthString(new Date(2026, 8, 17))).toBe("2026-09-01");
  });
});

describe("getMissingMonths", () => {
  it("returns just the current month for a member with no contributions this year", () => {
    const result = getMissingMonths(new Date(2020, 0, 1), new Date(2026, 8, 4), new Set());
    expect(result).toEqual([
      "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01",
      "2026-07-01", "2026-08-01", "2026-09-01",
    ]);
  });

  it("excludes months already in paidMonths", () => {
    const paid = new Set(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"]);
    const result = getMissingMonths(new Date(2020, 0, 1), new Date(2026, 8, 4), paid);
    expect(result).toEqual(["2026-08-01", "2026-09-01"]);
  });

  it("returns an empty array when the current month is already paid", () => {
    const paid = new Set(["2026-09-01"]);
    const result = getMissingMonths(new Date(2026, 8, 1), new Date(2026, 8, 4), paid);
    expect(result).toEqual([]);
  });

  it("does not go back further than the start of the current year, even for older members", () => {
    const result = getMissingMonths(new Date(2015, 5, 1), new Date(2026, 1, 10), new Set());
    expect(result).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("starts from the member's join month when they joined this year", () => {
    const result = getMissingMonths(new Date(2026, 5, 10), new Date(2026, 8, 4), new Set());
    expect(result).toEqual(["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"]);
  });
});

describe("splitAmountAcrossMonths", () => {
  it("splits an evenly-divisible amount equally", () => {
    const result = splitAmountAcrossMonths(300, ["2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(result).toEqual([
      { forMonth: "2026-07-01", amount: 100 },
      { forMonth: "2026-08-01", amount: 100 },
      { forMonth: "2026-09-01", amount: 100 },
    ]);
  });

  it("adds the remainder from a non-divisible amount to the last (most recent) month", () => {
    const result = splitAmountAcrossMonths(250, ["2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(result).toEqual([
      { forMonth: "2026-07-01", amount: 83.33 },
      { forMonth: "2026-08-01", amount: 83.33 },
      { forMonth: "2026-09-01", amount: 83.34 },
    ]);
    const total = result.reduce((sum, r) => sum + r.amount, 0);
    expect(Math.round(total * 100) / 100).toBe(250);
  });

  it("returns the full amount for a single month", () => {
    expect(splitAmountAcrossMonths(300, ["2026-09-01"])).toEqual([{ forMonth: "2026-09-01", amount: 300 }]);
  });
});

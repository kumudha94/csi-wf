import { describe, it, expect } from "vitest";
import { getDepositWindow } from "./dateRange";

describe("getDepositWindow", () => {
  it("spans from the 1st of the given month to the last day of the following month", () => {
    expect(getDepositWindow(new Date(2026, 7, 15))).toEqual({ from: "2026-08-01", to: "2026-09-30" });
  });

  it("rolls over the year at December", () => {
    expect(getDepositWindow(new Date(2026, 11, 3))).toEqual({ from: "2026-12-01", to: "2027-01-31" });
  });

  it("handles a following month with 28/29/31 days correctly", () => {
    // Jan -> Feb 2027 (not a leap year): Feb has 28 days.
    expect(getDepositWindow(new Date(2027, 0, 20))).toEqual({ from: "2027-01-01", to: "2027-02-28" });
    // 2028 is a leap year: Jan -> Feb has 29 days.
    expect(getDepositWindow(new Date(2028, 0, 20))).toEqual({ from: "2028-01-01", to: "2028-02-29" });
  });
});

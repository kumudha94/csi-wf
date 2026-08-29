import { describe, it, expect } from "vitest";
import { toMoney, fromMoney } from "./money";

describe("toMoney", () => {
  it("formats a number to a 2-decimal string", () => {
    expect(toMoney(100)).toBe("100.00");
    expect(toMoney(99.5)).toBe("99.50");
  });

  it("rounds to 2 decimal places", () => {
    // Not 10.005 - that literal is not exactly representable in binary
    // floating point (it's actually ~10.00499999999999989), so
    // .toFixed(2) rounds it down to "10.00", not "10.01". 10.006 has
    // enough margin from the rounding boundary to be unambiguous.
    expect(toMoney(10.006)).toBe("10.01");
    expect(toMoney(0.1 + 0.2)).toBe("0.30");
  });
});

describe("fromMoney", () => {
  it("parses a numeric-column string to a number", () => {
    expect(fromMoney("100.00")).toBe(100);
    expect(fromMoney("99.50")).toBe(99.5);
  });

  it("passes through a number unchanged", () => {
    expect(fromMoney(42)).toBe(42);
  });
});

import { describe, it, expect } from "vitest";
import { parseId } from "./parseId";

describe("parseId", () => {
  it("accepts positive integers", () => {
    expect(parseId("1")).toBe(1);
    expect(parseId("42")).toBe(42);
  });

  it("rejects non-numeric input rather than yielding NaN", () => {
    expect(parseId("abc")).toBeNull();
    expect(parseId("12abc")).toBeNull();
    expect(parseId("")).toBeNull();
    expect(parseId(" ")).toBeNull();
  });

  it("rejects zero, negatives, and fractions", () => {
    expect(parseId("0")).toBeNull();
    expect(parseId("-3")).toBeNull();
    expect(parseId("1.5")).toBeNull();
  });

  it("rejects values Postgres integer columns can't hold as ids", () => {
    expect(parseId("Infinity")).toBeNull();
    expect(parseId("NaN")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  insertMemberSchema,
  insertAttributeDefinitionSchema,
  insertEventSchema,
  insertExpenseSchema,
  insertContributionSchema,
} from "./schema";

describe("insertMemberSchema", () => {
  it("accepts a valid member", () => {
    const result = insertMemberSchema.safeParse({
      name: "Grace Devi",
      santhaNumber: "SW-101",
      phone: "9876543210",
      address: "12 Church Street",
      age: 54,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const result = insertMemberSchema.safeParse({ santhaNumber: "SW-101" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing santha number", () => {
    const result = insertMemberSchema.safeParse({ name: "Grace Devi" });
    expect(result.success).toBe(false);
  });

  it("allows optional fields to be omitted", () => {
    const result = insertMemberSchema.safeParse({ name: "Grace Devi", santhaNumber: "SW-101" });
    expect(result.success).toBe(true);
  });
});

describe("insertAttributeDefinitionSchema", () => {
  it("accepts a valid lowercase key", () => {
    const result = insertAttributeDefinitionSchema.safeParse({ key: "blood_group", label: "Blood Group" });
    expect(result.success).toBe(true);
  });

  it("rejects a key with spaces or uppercase letters", () => {
    expect(insertAttributeDefinitionSchema.safeParse({ key: "Blood Group", label: "Blood Group" }).success).toBe(
      false
    );
  });

  it("defaults type to text", () => {
    const result = insertAttributeDefinitionSchema.parse({ key: "notes", label: "Notes" });
    expect(result.type).toBe("text");
  });
});

describe("insertEventSchema", () => {
  it("requires a name", () => {
    expect(insertEventSchema.safeParse({ details: "Annual meet" }).success).toBe(false);
  });
});

describe("insertExpenseSchema", () => {
  it("accepts a general expense with no eventId", () => {
    const result = insertExpenseSchema.safeParse({
      description: "Stationery",
      amount: 250,
      date: "2026-08-29",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    expect(
      insertExpenseSchema.safeParse({ description: "Stationery", amount: 0, date: "2026-08-29" }).success
    ).toBe(false);
    expect(
      insertExpenseSchema.safeParse({ description: "Stationery", amount: -10, date: "2026-08-29" }).success
    ).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(
      insertExpenseSchema.safeParse({ description: "Stationery", amount: 10, date: "29-08-2026" }).success
    ).toBe(false);
  });

  it("defaults status to pending", () => {
    const result = insertExpenseSchema.parse({ description: "Stationery", amount: 10, date: "2026-08-29" });
    expect(result.status).toBe("pending");
  });
});

describe("insertContributionSchema", () => {
  it("requires a positive amount and a memberId", () => {
    expect(
      insertContributionSchema.safeParse({ memberId: 1, amount: 100, date: "2026-08-29" }).success
    ).toBe(true);
    expect(insertContributionSchema.safeParse({ amount: 100, date: "2026-08-29" }).success).toBe(false);
    expect(insertContributionSchema.safeParse({ memberId: 1, amount: -5, date: "2026-08-29" }).success).toBe(
      false
    );
  });
});

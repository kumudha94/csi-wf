import { describe, it, expect } from "vitest";
import {
  insertMemberSchema,
  insertAttributeDefinitionSchema,
  insertEventSchema,
  updateEventSchema,
  insertExpenseSchema,
  insertContributionSchema,
  collectContributionSchema,
  insertCashFundIncomeSchema,
  updateCashFundIncomeSchema,
  insertCashFundExpenseSchema,
  insertBankTransactionSchema,
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

  it("defaults status to active when omitted", () => {
    const result = insertMemberSchema.safeParse({ name: "Grace Devi", santhaNumber: "SW-101" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("active");
  });

  it("accepts the new lastName, oldMemNo, remarks and status fields", () => {
    const result = insertMemberSchema.safeParse({
      name: "Grace Devi",
      lastName: "Samuel",
      santhaNumber: "SW-101",
      oldMemNo: "42",
      remarks: "Moved from another parish",
      status: "inactive",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = insertMemberSchema.safeParse({ name: "Grace Devi", santhaNumber: "SW-101", status: "unknown" });
    expect(result.success).toBe(false);
  });

  it("defaults defaultAmount to 0 when omitted", () => {
    const result = insertMemberSchema.safeParse({ name: "Grace Devi", santhaNumber: "SW-101" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.defaultAmount).toBe(0);
  });

  it("accepts a positive defaultAmount and rejects a negative one", () => {
    expect(
      insertMemberSchema.safeParse({ name: "Grace Devi", santhaNumber: "SW-101", defaultAmount: 300 }).success
    ).toBe(true);
    expect(
      insertMemberSchema.safeParse({ name: "Grace Devi", santhaNumber: "SW-101", defaultAmount: -50 }).success
    ).toBe(false);
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

  it("accepts a list type with options", () => {
    const result = insertAttributeDefinitionSchema.safeParse({
      key: "blood_group",
      label: "Blood Group",
      type: "list",
      options: ["A+", "B+", "O+"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a list type with no options", () => {
    const result = insertAttributeDefinitionSchema.safeParse({ key: "blood_group", label: "Blood Group", type: "list" });
    expect(result.success).toBe(false);
  });

  it("rejects a list type with only blank options", () => {
    const result = insertAttributeDefinitionSchema.safeParse({
      key: "blood_group",
      label: "Blood Group",
      type: "list",
      options: ["  "],
    });
    expect(result.success).toBe(false);
  });
});

describe("insertEventSchema", () => {
  it("requires a name", () => {
    expect(insertEventSchema.safeParse({ details: "Annual meet" }).success).toBe(false);
  });

  it("accepts an omitted or null eventDate", () => {
    expect(insertEventSchema.safeParse({ name: "Annual Meet" }).success).toBe(true);
    expect(insertEventSchema.safeParse({ name: "Annual Meet", eventDate: null }).success).toBe(true);
  });

  it("accepts a valid eventDate and rejects a malformed one", () => {
    expect(insertEventSchema.safeParse({ name: "Annual Meet", eventDate: "2026-09-15" }).success).toBe(true);
    expect(insertEventSchema.safeParse({ name: "Annual Meet", eventDate: "15-09-2026" }).success).toBe(false);
  });

  it("defaults hasEventFund to false", () => {
    const result = insertEventSchema.parse({ name: "Annual Meet" });
    expect(result.hasEventFund).toBe(false);
  });

  it("requires an eventDate when hasEventFund is true", () => {
    expect(insertEventSchema.safeParse({ name: "Annual Meet", hasEventFund: true }).success).toBe(false);
    expect(
      insertEventSchema.safeParse({ name: "Annual Meet", hasEventFund: true, eventDate: null }).success
    ).toBe(false);
    expect(
      insertEventSchema.safeParse({ name: "Annual Meet", hasEventFund: true, eventDate: "2026-09-15" }).success
    ).toBe(true);
  });

  it("does not require an eventDate when hasEventFund is false", () => {
    expect(insertEventSchema.safeParse({ name: "Annual Meet", hasEventFund: false }).success).toBe(true);
  });
});

describe("updateEventSchema", () => {
  it("allows a partial patch without re-checking the hasEventFund/eventDate rule", () => {
    expect(updateEventSchema.safeParse({ hasEventFund: true }).success).toBe(true);
  });

  it("still rejects a malformed eventDate", () => {
    expect(updateEventSchema.safeParse({ eventDate: "15-09-2026" }).success).toBe(false);
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

  it("defaults fundSource to bank", () => {
    const result = insertExpenseSchema.parse({ description: "Stationery", amount: 10, date: "2026-08-29" });
    expect(result.fundSource).toBe("bank");
  });

  it("accepts an explicit cash fundSource", () => {
    const result = insertExpenseSchema.safeParse({
      description: "Decorations",
      amount: 1500,
      date: "2026-08-29",
      fundSource: "cash",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fundSource).toBe("cash");
  });

  it("rejects an invalid fundSource", () => {
    expect(
      insertExpenseSchema.safeParse({ description: "Stationery", amount: 10, date: "2026-08-29", fundSource: "wallet" })
        .success
    ).toBe(false);
  });

  it("accepts the eventFund fundSource", () => {
    const result = insertExpenseSchema.safeParse({
      description: "Offering",
      amount: 500,
      date: "2026-08-29",
      fundSource: "eventFund",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fundSource).toBe("eventFund");
  });

  it("defaults txnType to debit", () => {
    const result = insertExpenseSchema.parse({ description: "Stationery", amount: 10, date: "2026-08-29" });
    expect(result.txnType).toBe("debit");
  });

  it("accepts an explicit credit txnType with a donor name", () => {
    const result = insertExpenseSchema.safeParse({
      description: "Offering",
      amount: 500,
      date: "2026-08-29",
      fundSource: "eventFund",
      txnType: "credit",
      donorName: "Grace Devi",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.txnType).toBe("credit");
      expect(result.data.donorName).toBe("Grace Devi");
    }
  });

  it("rejects an invalid txnType", () => {
    expect(
      insertExpenseSchema.safeParse({ description: "Stationery", amount: 10, date: "2026-08-29", txnType: "refund" })
        .success
    ).toBe(false);
  });
});

describe("insertContributionSchema", () => {
  it("requires a positive amount, a memberId, and a forMonth", () => {
    expect(
      insertContributionSchema.safeParse({ memberId: 1, amount: 100, date: "2026-08-29", forMonth: "2026-08-01" })
        .success
    ).toBe(true);
    expect(
      insertContributionSchema.safeParse({ amount: 100, date: "2026-08-29", forMonth: "2026-08-01" }).success
    ).toBe(false);
    expect(
      insertContributionSchema.safeParse({ memberId: 1, amount: -5, date: "2026-08-29", forMonth: "2026-08-01" })
        .success
    ).toBe(false);
    expect(
      insertContributionSchema.safeParse({ memberId: 1, amount: 100, date: "2026-08-29" }).success
    ).toBe(false);
  });
});

describe("collectContributionSchema", () => {
  it("accepts a valid collection", () => {
    const result = collectContributionSchema.safeParse({ memberId: 1, totalAmount: 300, date: "2026-09-07" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing memberId", () => {
    expect(collectContributionSchema.safeParse({ totalAmount: 300, date: "2026-09-07" }).success).toBe(false);
  });

  it("rejects a zero or negative totalAmount", () => {
    expect(collectContributionSchema.safeParse({ memberId: 1, totalAmount: 0, date: "2026-09-07" }).success).toBe(
      false
    );
  });
});

describe("insertCashFundIncomeSchema", () => {
  it("accepts a valid offering entry with a reason/description", () => {
    const result = insertCashFundIncomeSchema.safeParse({
      type: "offering",
      amount: 350,
      date: "2026-09-01",
      note: "Sunday morning service",
    });
    expect(result.success).toBe(true);
  });

  it("requires a note (reason/description) for an offering", () => {
    expect(insertCashFundIncomeSchema.safeParse({ type: "offering", amount: 350, date: "2026-09-01" }).success).toBe(
      false
    );
    expect(
      insertCashFundIncomeSchema.safeParse({ type: "offering", amount: 350, date: "2026-09-01", note: "   " })
        .success
    ).toBe(false);
  });

  it("accepts a donation with a donor name and no note", () => {
    const result = insertCashFundIncomeSchema.safeParse({
      type: "donation",
      amount: 1000,
      date: "2026-09-01",
      donorName: "Grace Devi",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a donation with no donor name (non-member donor)", () => {
    const result = insertCashFundIncomeSchema.safeParse({ type: "donation", amount: 500, date: "2026-09-01" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid type", () => {
    expect(
      insertCashFundIncomeSchema.safeParse({ type: "tithe", amount: 100, date: "2026-09-01", note: "x" }).success
    ).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    expect(
      insertCashFundIncomeSchema.safeParse({ type: "offering", amount: 0, date: "2026-09-01", note: "x" }).success
    ).toBe(false);
    expect(
      insertCashFundIncomeSchema.safeParse({ type: "offering", amount: -5, date: "2026-09-01", note: "x" }).success
    ).toBe(false);
  });

  it("accepts a donorName at the 150-character limit", () => {
    const donorName = "A".repeat(150);
    const result = insertCashFundIncomeSchema.safeParse({
      type: "donation",
      amount: 100,
      date: "2026-09-01",
      donorName,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a donorName over the 150-character limit", () => {
    const donorName = "A".repeat(151);
    const result = insertCashFundIncomeSchema.safeParse({
      type: "donation",
      amount: 100,
      date: "2026-09-01",
      donorName,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(
      insertCashFundIncomeSchema.safeParse({ type: "offering", amount: 100, date: "01-09-2026", note: "x" }).success
    ).toBe(false);
    expect(
      insertCashFundIncomeSchema.safeParse({ type: "offering", amount: 100, date: "2026-9-1", note: "x" }).success
    ).toBe(false);
  });
});

describe("updateCashFundIncomeSchema", () => {
  it("allows a partial update to just the amount, even for an offering with no note in the payload", () => {
    // Partial updates don't re-validate the offering/note cross-field rule
    // -- the merged record isn't known from a partial payload alone.
    const result = updateCashFundIncomeSchema.safeParse({ amount: 400 });
    expect(result.success).toBe(true);
  });

  it("still rejects a non-positive amount when provided", () => {
    expect(updateCashFundIncomeSchema.safeParse({ amount: 0 }).success).toBe(false);
  });
});

describe("insertCashFundExpenseSchema", () => {
  it("accepts a valid meeting expense", () => {
    const result = insertCashFundExpenseSchema.safeParse({ description: "Tea and biscuits", amount: 120, date: "2026-09-01" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing description", () => {
    expect(insertCashFundExpenseSchema.safeParse({ amount: 120, date: "2026-09-01" }).success).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    expect(insertCashFundExpenseSchema.safeParse({ description: "Auto fare", amount: 0, date: "2026-09-01" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(
      insertCashFundExpenseSchema.safeParse({ description: "Auto fare", amount: 10, date: "01-09-2026" }).success
    ).toBe(false);
    expect(
      insertCashFundExpenseSchema.safeParse({ description: "Auto fare", amount: 10, date: "2026-9-1" }).success
    ).toBe(false);
  });
});

describe("insertBankTransactionSchema", () => {
  it("accepts a valid deposit", () => {
    const result = insertBankTransactionSchema.safeParse({
      type: "deposit",
      description: "August contributions deposited",
      amount: 15000,
      date: "2026-09-04",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid withdrawal", () => {
    const result = insertBankTransactionSchema.safeParse({
      type: "withdrawal",
      description: "Withdrawn for Christmas celebration",
      amount: 20000,
      date: "2026-09-04",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid cash_expense with a receipt photo", () => {
    const result = insertBankTransactionSchema.safeParse({
      type: "cash_expense",
      description: "Decorations",
      amount: 1500,
      date: "2026-09-04",
      receiptPhotoUrl: "https://storage.googleapis.com/bucket/receipts/abc.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid type", () => {
    expect(
      insertBankTransactionSchema.safeParse({ type: "refund", description: "x", amount: 100, date: "2026-09-04" })
        .success
    ).toBe(false);
  });

  it("rejects a missing description", () => {
    expect(
      insertBankTransactionSchema.safeParse({ type: "deposit", amount: 100, date: "2026-09-04" }).success
    ).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    expect(
      insertBankTransactionSchema.safeParse({ type: "deposit", description: "x", amount: 0, date: "2026-09-04" })
        .success
    ).toBe(false);
  });
});

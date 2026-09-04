import { pgTable, pgEnum, serial, varchar, text, integer, numeric, timestamp, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod";

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

// ---------- auth_account ----------
export const authAccount = pgTable("auth_account", {
  id: serial("id").primaryKey(),
  pinHash: varchar("pin_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type AuthAccount = typeof authAccount.$inferSelect;

// ---------- members ----------
export const MEMBER_STATUSES = ["active", "inactive", "died"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
export const memberStatusEnum = pgEnum("member_status", MEMBER_STATUSES);

export const members = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    lastName: varchar("last_name", { length: 150 }),
    santhaNumber: varchar("santha_number", { length: 50 }).notNull(),
    oldMemNo: varchar("old_mem_no", { length: 50 }),
    phone: varchar("phone", { length: 20 }),
    address: text("address"),
    age: integer("age"),
    remarks: text("remarks"),
    status: memberStatusEnum("status").notNull().default("active"),
    // The santha amount this member pays each month, so a future bulk
    // "generate this month's contributions" flow can prefill from it
    // instead of a treasurer typing ~300 amounts by hand.
    defaultAmount: numeric("default_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    santhaNumberIdx: uniqueIndex("members_santha_number_idx").on(table.santhaNumber),
  })
);
export type Member = typeof members.$inferSelect;

export const insertMemberSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  lastName: z.string().max(150).nullable().optional(),
  santhaNumber: z.string().min(1, "Santha number is required").max(50),
  oldMemNo: z.string().max(50).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  address: z.string().nullable().optional(),
  age: z.coerce.number().int().positive().max(150).nullable().optional(),
  remarks: z.string().nullable().optional(),
  status: z.enum(MEMBER_STATUSES).default("active"),
  defaultAmount: z.coerce.number().nonnegative("Default amount cannot be negative").default(0),
});
export type MemberInput = z.infer<typeof insertMemberSchema>;

// ---------- attribute_definitions ----------
export const ATTRIBUTE_TYPES = ["text", "number", "date", "list"] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export const attributeDefinitions = pgTable(
  "attribute_definitions",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 60 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("text"),
    options: jsonb("options").$type<string[]>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("attribute_definitions_key_idx").on(table.key),
  })
);
export type AttributeDefinition = typeof attributeDefinitions.$inferSelect;

export const insertAttributeDefinitionSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z][a-z0-9_]*$/, "key must be lowercase letters, numbers, and underscores, starting with a letter"),
    label: z.string().min(1, "Label is required").max(100),
    type: z.enum(ATTRIBUTE_TYPES).default("text"),
    options: z.array(z.string().trim().min(1)).max(50).optional(),
  })
  .refine((data) => data.type !== "list" || (data.options && data.options.length > 0), {
    message: "List fields need at least one option",
    path: ["options"],
  });
export type AttributeDefinitionInput = z.infer<typeof insertAttributeDefinitionSchema>;

// `key` is intentionally excluded here — it's the join column member_attribute_values.attributeKey
// relies on, so renaming it after values exist would silently orphan them. Editing is limited to
// the display-facing fields.
export const updateAttributeDefinitionSchema = z
  .object({
    label: z.string().min(1, "Label is required").max(100).optional(),
    type: z.enum(ATTRIBUTE_TYPES).optional(),
    options: z.array(z.string().trim().min(1)).max(50).optional(),
  })
  .refine((data) => data.type !== "list" || (data.options && data.options.length > 0), {
    message: "List fields need at least one option",
    path: ["options"],
  });
export type AttributeDefinitionUpdateInput = z.infer<typeof updateAttributeDefinitionSchema>;

// ---------- member_attribute_values ----------
export const memberAttributeValues = pgTable(
  "member_attribute_values",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    attributeKey: varchar("attribute_key", { length: 60 }).notNull(),
    value: text("value"),
  },
  (table) => ({
    memberKeyIdx: uniqueIndex("member_attribute_values_member_key_idx").on(table.memberId, table.attributeKey),
  })
);
export type MemberAttributeValue = typeof memberAttributeValues.$inferSelect;

// ---------- events ----------
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  details: text("details"),
  // Nullable: events created before this field existed have no date, and a
  // treasurer may log an event before its date is finalized.
  eventDate: varchar("event_date", { length: 10 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type Event = typeof events.$inferSelect;

export const insertEventSchema = z.object({
  name: z.string().min(1, "Event name is required").max(150),
  details: z.string().nullable().optional(),
  eventDate: dateStringSchema.nullable().optional(),
});
export type EventInput = z.infer<typeof insertEventSchema>;

// ---------- expenses ----------
export const EXPENSE_STATUSES = ["paid", "pending"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => events.id, { onDelete: "set null" }),
  description: varchar("description", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  receiptPhotoUrl: varchar("receipt_photo_url", { length: 500 }),
  status: varchar("status", { length: 10 }).notNull().default("pending"),
  date: varchar("date", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type Expense = typeof expenses.$inferSelect;

export const insertExpenseSchema = z.object({
  eventId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().min(1, "Description is required").max(255),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  receiptPhotoUrl: z.string().url().nullable().optional(),
  status: z.enum(EXPENSE_STATUSES).default("pending"),
  date: dateStringSchema,
});
export type ExpenseInput = z.infer<typeof insertExpenseSchema>;

// ---------- contributions ----------
export const contributions = pgTable("contributions", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type Contribution = typeof contributions.$inferSelect;

export const insertContributionSchema = z.object({
  memberId: z.coerce.number().int().positive("A member must be selected"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: dateStringSchema,
  note: z.string().nullable().optional(),
});
export type ContributionInput = z.infer<typeof insertContributionSchema>;

// ---------- cash_fund_income ----------
export const CASH_INCOME_TYPES = ["offering", "donation"] as const;
export type CashIncomeType = (typeof CASH_INCOME_TYPES)[number];

export const cashFundIncome = pgTable("cash_fund_income", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 10 }).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  donorName: varchar("donor_name", { length: 150 }),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type CashFundIncome = typeof cashFundIncome.$inferSelect;

export const insertCashFundIncomeSchema = z.object({
  type: z.enum(CASH_INCOME_TYPES),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: dateStringSchema,
  // Free text, not a members FK: donors are frequently non-members. Only
  // meaningful when type is "donation", but not validated against type —
  // an empty/omitted name is always valid.
  donorName: z.string().max(150).nullable().optional(),
  note: z.string().nullable().optional(),
});
export type CashFundIncomeInput = z.infer<typeof insertCashFundIncomeSchema>;

// ---------- cash_fund_expenses ----------
export const cashFundExpenses = pgTable("cash_fund_expenses", {
  id: serial("id").primaryKey(),
  description: varchar("description", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type CashFundExpense = typeof cashFundExpenses.$inferSelect;

// No paid/pending status, unlike `expenses` — cash spending happens same-day.
export const insertCashFundExpenseSchema = z.object({
  description: z.string().min(1, "Description is required").max(255),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: dateStringSchema,
});
export type CashFundExpenseInput = z.infer<typeof insertCashFundExpenseSchema>;

// ---------- settings ----------
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  // Column name stays "opening_balance" (pre-existing) — only the TS
  // property is renamed, so this is a pure additive migration with no
  // rename for drizzle-kit push to negotiate.
  bankOpeningBalance: numeric("opening_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  cashOpeningBalance: numeric("cash_opening_balance", { precision: 10, scale: 2 }).notNull().default("0"),
});
export type Settings = typeof settings.$inferSelect;

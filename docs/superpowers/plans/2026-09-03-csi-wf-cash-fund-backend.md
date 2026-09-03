# CSI-WF Cash Fund Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cash Fund (Offering + Donation income, meeting-day expenses) as a second, independent balance alongside the existing Bank Fund (Contributions/Expenses), extending the balance, settings, and reports endpoints to cover both funds.

**Architecture:** Two new resource tables (`cash_fund_income`, `cash_fund_expenses`) and their storage/route modules, mirroring the existing `contributions` and `expenses` modules exactly. `settings` gains a second opening balance. `/api/balance` and `/api/reports` are extended to report both funds side by side, reusing the existing `computeBalance()` function for the Cash Fund (its formula has the same additive/subtractive shape as the Bank Fund, just with no pending-expense concept).

**Tech Stack:** Express 4, TypeScript 5, Drizzle ORM, Postgres (Neon), zod, vitest — same stack as the existing backend, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-03-cash-fund-design.md`

## Global Constraints

- Money is stored as Postgres `numeric(10,2)` (string at the DB boundary). Conversion happens only via `toMoney`/`fromMoney` in `server/lib/money.ts` — never inline.
- Cash Fund balance formula (from spec): `balance = cashOpeningBalance + Σcash_fund_income − Σcash_fund_expenses`. This is the same shape as `computeBalance({ openingBalance, totalContributions, totalPaidExpenses })` in `server/lib/balance.ts` — reuse it directly (pass cash income as `totalContributions`, cash expenses as `totalPaidExpenses`) rather than writing a second formula.
- Bank Fund balance formula is unchanged: `balance = bankOpeningBalance + Σcontributions − Σ(expenses where status='paid')`.
- Dates are `YYYY-MM-DD` strings validated by the existing `dateStringSchema` (shared/schema.ts).
- Every route handler is wrapped with `wrap()` from `server/lib/asyncHandler.ts`; zod parse errors surface as 400 via the shared error middleware — never ad-hoc try/catch.
- `@shared/*` resolves to `./shared/*`.
- Every new resource router is mounted under `requireAuth` in `server/routes/index.ts`, matching every existing resource router.
- **No destructive schema rename:** the existing `settings.opening_balance` Postgres column is kept as-is and re-mapped in Drizzle to the TS property `bankOpeningBalance` (`numeric("opening_balance", ...)`). Only `cashOpeningBalance` is a genuinely new column. This keeps `npm run db:push` a purely additive, non-interactive operation — a real column rename would make `drizzle-kit push` prompt interactively, which the Render build (`npm run db:push` as part of `buildCommand`) cannot answer.

---

### Task 1: Schema — Cash Fund tables and settings' second opening balance

**Files:**
- Modify: `shared/schema.ts`
- Modify: `shared/schema.test.ts`

**Interfaces:**
- Produces: `cashFundIncome` table, `CashFundIncome`, `CashFundIncomeInput`, `insertCashFundIncomeSchema`, `CASH_INCOME_TYPES`, `CashIncomeType` — used by Task 2.
- Produces: `cashFundExpenses` table, `CashFundExpense`, `CashFundExpenseInput`, `insertCashFundExpenseSchema` — used by Task 3.
- Produces: `settings.bankOpeningBalance`, `settings.cashOpeningBalance` (both `numeric` columns on the existing `settings` table) — used by Tasks 4, 5, 6.
- Consumes: `dateStringSchema` (existing, unchanged).

- [ ] **Step 1: Write the failing schema tests**

Add to the end of `shared/schema.test.ts`:

```ts
import {
  insertMemberSchema,
  insertAttributeDefinitionSchema,
  insertEventSchema,
  insertExpenseSchema,
  insertContributionSchema,
  insertCashFundIncomeSchema,
  insertCashFundExpenseSchema,
} from "./schema";

// ... (existing describe blocks stay unchanged) ...

describe("insertCashFundIncomeSchema", () => {
  it("accepts a valid offering entry", () => {
    const result = insertCashFundIncomeSchema.safeParse({ type: "offering", amount: 350, date: "2026-09-01" });
    expect(result.success).toBe(true);
  });

  it("accepts a donation with a donor name", () => {
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
    expect(insertCashFundIncomeSchema.safeParse({ type: "tithe", amount: 100, date: "2026-09-01" }).success).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    expect(insertCashFundIncomeSchema.safeParse({ type: "offering", amount: 0, date: "2026-09-01" }).success).toBe(false);
    expect(insertCashFundIncomeSchema.safeParse({ type: "offering", amount: -5, date: "2026-09-01" }).success).toBe(false);
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
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npm test -- schema.test.ts`
Expected: FAIL — `insertCashFundIncomeSchema` / `insertCashFundExpenseSchema` are not exported from `./schema`.

- [ ] **Step 3: Add the new tables and schemas, and extend `settings`**

In `shared/schema.ts`, after the `contributions` section and before `// ---------- settings ----------`, insert:

```ts
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
```

Then replace the existing `settings` table with:

```ts
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
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npm test -- schema.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts shared/schema.test.ts
git commit -m "feat: add cash fund schema and second opening balance"
```

---

### Task 2: Cash Fund Income — storage, routes, registration

**Files:**
- Create: `server/storage/cashFundIncome.ts`
- Create: `server/routes/cashFundIncome.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `cashFundIncome`, `CashFundIncome`, `CashFundIncomeInput`, `insertCashFundIncomeSchema` (Task 1); `toMoney`/`fromMoney` (`server/lib/money.ts`); `wrap` (`server/lib/asyncHandler.ts`); `parseId` (`server/lib/parseId.ts`).
- Produces: `cashFundIncomeRouter`, mounted at `/api/cash-fund-income`, consumed by mobile (`GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`).

- [ ] **Step 1: Create the storage module**

`server/storage/cashFundIncome.ts`:

```ts
import { db } from "../db";
import { cashFundIncome, type CashFundIncome, type CashFundIncomeInput } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function listCashFundIncome(): Promise<CashFundIncome[]> {
  return db.select().from(cashFundIncome).orderBy(desc(cashFundIncome.date));
}

export async function createCashFundIncome(data: CashFundIncomeInput): Promise<CashFundIncome> {
  const [row] = await db
    .insert(cashFundIncome)
    .values({ ...data, amount: toMoney(data.amount) })
    .returning();
  return row;
}

export async function updateCashFundIncome(
  id: number,
  data: Partial<CashFundIncomeInput>
): Promise<CashFundIncome | null> {
  const { amount, ...rest } = data;
  const [row] = await db
    .update(cashFundIncome)
    .set({ ...rest, ...(amount !== undefined ? { amount: toMoney(amount) } : {}) })
    .where(eq(cashFundIncome.id, id))
    .returning();
  return row ?? null;
}

export async function deleteCashFundIncome(id: number): Promise<boolean> {
  const result = await db.delete(cashFundIncome).where(eq(cashFundIncome.id, id)).returning({ id: cashFundIncome.id });
  return result.length > 0;
}
```

- [ ] **Step 2: Create the route module**

`server/routes/cashFundIncome.ts`:

```ts
import { Router } from "express";
import { insertCashFundIncomeSchema, type CashFundIncome } from "@shared/schema";
import * as cashFundIncomeStorage from "../storage/cashFundIncome";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";
import { parseId } from "../lib/parseId";

export const cashFundIncomeRouter = Router();

function serialize(row: CashFundIncome) {
  return { ...row, amount: fromMoney(row.amount) };
}

cashFundIncomeRouter.get(
  "/",
  wrap(async (_req, res) => {
    const list = await cashFundIncomeStorage.listCashFundIncome();
    res.json(list.map(serialize));
  })
);

cashFundIncomeRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertCashFundIncomeSchema.parse(req.body);
    const row = await cashFundIncomeStorage.createCashFundIncome(data);
    res.status(201).json(serialize(row));
  })
);

cashFundIncomeRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const data = insertCashFundIncomeSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const row = await cashFundIncomeStorage.updateCashFundIncome(id, data);
    if (!row) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    res.json(serialize(row));
  })
);

cashFundIncomeRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await cashFundIncomeStorage.deleteCashFundIncome(id);
    if (!deleted) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    res.status(204).send();
  })
);
```

- [ ] **Step 3: Register the router**

In `server/routes/index.ts`, add the import next to the other resource routers:

```ts
import { cashFundIncomeRouter } from "./cashFundIncome";
```

And the mount, next to `contributionsRouter`:

```ts
app.use("/api/cash-fund-income", requireAuth, cashFundIncomeRouter);
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev` (in one terminal), then in another:

```bash
TOKEN=<a valid bearer token from /api/auth/login>
curl -s -X POST localhost:5000/api/cash-fund-income \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"offering","amount":350,"date":"2026-09-01"}'
curl -s localhost:5000/api/cash-fund-income -H "Authorization: Bearer $TOKEN"
```

Expected: POST returns 201 with `amount: 350` (a number, not a string); GET returns an array containing that row.

- [ ] **Step 6: Commit**

```bash
git add server/storage/cashFundIncome.ts server/routes/cashFundIncome.ts server/routes/index.ts
git commit -m "feat: add cash fund income resource"
```

---

### Task 3: Cash Fund Expenses — storage, routes, registration

**Files:**
- Create: `server/storage/cashFundExpenses.ts`
- Create: `server/routes/cashFundExpenses.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `cashFundExpenses`, `CashFundExpense`, `CashFundExpenseInput`, `insertCashFundExpenseSchema` (Task 1); same libs as Task 2.
- Produces: `cashFundExpensesRouter`, mounted at `/api/cash-fund-expenses`.

- [ ] **Step 1: Create the storage module**

`server/storage/cashFundExpenses.ts`:

```ts
import { db } from "../db";
import { cashFundExpenses, type CashFundExpense, type CashFundExpenseInput } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function listCashFundExpenses(): Promise<CashFundExpense[]> {
  return db.select().from(cashFundExpenses).orderBy(desc(cashFundExpenses.date));
}

export async function createCashFundExpense(data: CashFundExpenseInput): Promise<CashFundExpense> {
  const [row] = await db
    .insert(cashFundExpenses)
    .values({ ...data, amount: toMoney(data.amount) })
    .returning();
  return row;
}

export async function updateCashFundExpense(
  id: number,
  data: Partial<CashFundExpenseInput>
): Promise<CashFundExpense | null> {
  const { amount, ...rest } = data;
  const [row] = await db
    .update(cashFundExpenses)
    .set({ ...rest, ...(amount !== undefined ? { amount: toMoney(amount) } : {}) })
    .where(eq(cashFundExpenses.id, id))
    .returning();
  return row ?? null;
}

export async function deleteCashFundExpense(id: number): Promise<boolean> {
  const result = await db
    .delete(cashFundExpenses)
    .where(eq(cashFundExpenses.id, id))
    .returning({ id: cashFundExpenses.id });
  return result.length > 0;
}
```

- [ ] **Step 2: Create the route module**

`server/routes/cashFundExpenses.ts`:

```ts
import { Router } from "express";
import { insertCashFundExpenseSchema, type CashFundExpense } from "@shared/schema";
import * as cashFundExpensesStorage from "../storage/cashFundExpenses";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";
import { parseId } from "../lib/parseId";

export const cashFundExpensesRouter = Router();

function serialize(row: CashFundExpense) {
  return { ...row, amount: fromMoney(row.amount) };
}

cashFundExpensesRouter.get(
  "/",
  wrap(async (_req, res) => {
    const list = await cashFundExpensesStorage.listCashFundExpenses();
    res.json(list.map(serialize));
  })
);

cashFundExpensesRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertCashFundExpenseSchema.parse(req.body);
    const row = await cashFundExpensesStorage.createCashFundExpense(data);
    res.status(201).json(serialize(row));
  })
);

cashFundExpensesRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const data = insertCashFundExpenseSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const row = await cashFundExpensesStorage.updateCashFundExpense(id, data);
    if (!row) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    res.json(serialize(row));
  })
);

cashFundExpensesRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await cashFundExpensesStorage.deleteCashFundExpense(id);
    if (!deleted) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    res.status(204).send();
  })
);
```

- [ ] **Step 3: Register the router**

In `server/routes/index.ts`, add:

```ts
import { cashFundExpensesRouter } from "./cashFundExpenses";
```

```ts
app.use("/api/cash-fund-expenses", requireAuth, cashFundExpensesRouter);
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/storage/cashFundExpenses.ts server/routes/cashFundExpenses.ts server/routes/index.ts
git commit -m "feat: add cash fund expenses resource"
```

---

### Task 4: Settings — two opening balances

**Files:**
- Modify: `server/storage/settings.ts`
- Modify: `server/routes/settings.ts`

**Interfaces:**
- Consumes: `settings.bankOpeningBalance`, `settings.cashOpeningBalance` (Task 1).
- Produces: `GET /api/settings` → `{ bankOpeningBalance: number; cashOpeningBalance: number }` (breaking change from the old flat `{ openingBalance: number }` — Mobile Task 6 depends on this). `PUT /api/settings` accepts either or both fields.

- [ ] **Step 1: Update storage**

Replace the contents of `server/storage/settings.ts`:

```ts
import { db } from "../db";
import { settings, type Settings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function getSettings(): Promise<Settings | null> {
  const [row] = await db.select().from(settings).limit(1);
  return row ?? null;
}

export type OpeningBalanceUpdate = {
  bankOpeningBalance?: number;
  cashOpeningBalance?: number;
};

export async function setOpeningBalances(data: OpeningBalanceUpdate): Promise<Settings> {
  const existing = await getSettings();
  const values: Record<string, string> = {};
  if (data.bankOpeningBalance !== undefined) values.bankOpeningBalance = toMoney(data.bankOpeningBalance);
  if (data.cashOpeningBalance !== undefined) values.cashOpeningBalance = toMoney(data.cashOpeningBalance);

  if (existing) {
    const [row] = await db.update(settings).set(values).where(eq(settings.id, existing.id)).returning();
    return row;
  }
  const [row] = await db
    .insert(settings)
    .values({
      bankOpeningBalance: toMoney(data.bankOpeningBalance ?? 0),
      cashOpeningBalance: toMoney(data.cashOpeningBalance ?? 0),
    })
    .returning();
  return row;
}
```

- [ ] **Step 2: Update routes**

Replace the contents of `server/routes/settings.ts`:

```ts
import { Router } from "express";
import { z } from "zod";
import * as settingsStorage from "../storage/settings";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";

export const settingsRouter = Router();

const openingBalanceSchema = z
  .object({
    bankOpeningBalance: z.coerce.number().min(0, "Bank opening balance cannot be negative").optional(),
    cashOpeningBalance: z.coerce.number().min(0, "Cash opening balance cannot be negative").optional(),
  })
  .refine((d) => d.bankOpeningBalance !== undefined || d.cashOpeningBalance !== undefined, {
    message: "At least one opening balance must be provided",
  });

settingsRouter.get(
  "/",
  wrap(async (_req, res) => {
    const row = await settingsStorage.getSettings();
    res.json({
      bankOpeningBalance: row ? fromMoney(row.bankOpeningBalance) : 0,
      cashOpeningBalance: row ? fromMoney(row.cashOpeningBalance) : 0,
    });
  })
);

settingsRouter.put(
  "/",
  wrap(async (req, res) => {
    const data = openingBalanceSchema.parse(req.body);
    const row = await settingsStorage.setOpeningBalances(data);
    res.json({
      bankOpeningBalance: fromMoney(row.bankOpeningBalance),
      cashOpeningBalance: fromMoney(row.cashOpeningBalance),
    });
  })
);
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: errors in `server/storage/balance.ts` and `server/routes/reports.ts` referencing `settingsRow.openingBalance` — expected, fixed in Tasks 5 and 6.

- [ ] **Step 4: Commit**

```bash
git add server/storage/settings.ts server/routes/settings.ts
git commit -m "feat: split settings into bank and cash opening balances"
```

---

### Task 5: Balance — Bank Fund + Cash Fund breakdown

**Files:**
- Modify: `server/storage/balance.ts`
- Modify: `server/routes/balance.ts`

**Interfaces:**
- Consumes: `cashFundIncome`, `cashFundExpenses` tables (Task 1); `computeBalance` (`server/lib/balance.ts`, unchanged).
- Produces: `GET /api/balance` → `{ bankFund: {...}, cashFund: {...} }` (breaking change from the old flat shape — Mobile Task 5 depends on this).

- [ ] **Step 1: Update balance storage**

Replace the contents of `server/storage/balance.ts`:

```ts
import { db } from "../db";
import { contributions, expenses, settings, cashFundIncome, cashFundExpenses } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { fromMoney } from "../lib/money";

export type BalanceInputs = {
  bankOpeningBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
  cashOpeningBalance: number;
  totalCashIncome: number;
  totalCashExpenses: number;
};

export async function getBalanceInputs(): Promise<BalanceInputs> {
  const [settingsRow] = await db.select().from(settings).limit(1);
  const bankOpeningBalance = settingsRow ? fromMoney(settingsRow.bankOpeningBalance) : 0;
  const cashOpeningBalance = settingsRow ? fromMoney(settingsRow.cashOpeningBalance) : 0;

  const [contribRow] = await db
    .select({ total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
    .from(contributions);
  const totalContributions = fromMoney(contribRow.total);

  const [paidRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(eq(expenses.status, "paid"));
  const totalPaidExpenses = fromMoney(paidRow.total);

  const [pendingRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(eq(expenses.status, "pending"));
  const totalPendingExpenses = fromMoney(pendingRow.total);

  const [cashIncomeRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome);
  const totalCashIncome = fromMoney(cashIncomeRow.total);

  const [cashExpenseRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundExpenses.amount}), 0)` })
    .from(cashFundExpenses);
  const totalCashExpenses = fromMoney(cashExpenseRow.total);

  return {
    bankOpeningBalance,
    totalContributions,
    totalPaidExpenses,
    totalPendingExpenses,
    cashOpeningBalance,
    totalCashIncome,
    totalCashExpenses,
  };
}
```

- [ ] **Step 2: Update balance route**

Replace the contents of `server/routes/balance.ts`:

```ts
import { Router } from "express";
import { wrap } from "../lib/asyncHandler";
import { getBalanceInputs } from "../storage/balance";
import { computeBalance } from "../lib/balance";

export const balanceRouter = Router();

balanceRouter.get(
  "/",
  wrap(async (_req, res) => {
    const inputs = await getBalanceInputs();

    const bankBalance = computeBalance({
      openingBalance: inputs.bankOpeningBalance,
      totalContributions: inputs.totalContributions,
      totalPaidExpenses: inputs.totalPaidExpenses,
    });
    // Cash Fund has no pending-expense concept, so this reuses the exact
    // same formula shape with cash income/expenses in place of
    // contributions/paid-expenses.
    const cashBalance = computeBalance({
      openingBalance: inputs.cashOpeningBalance,
      totalContributions: inputs.totalCashIncome,
      totalPaidExpenses: inputs.totalCashExpenses,
    });

    res.json({
      bankFund: {
        openingBalance: inputs.bankOpeningBalance,
        totalContributions: inputs.totalContributions,
        totalPaidExpenses: inputs.totalPaidExpenses,
        totalPendingExpenses: inputs.totalPendingExpenses,
        balance: bankBalance,
      },
      cashFund: {
        openingBalance: inputs.cashOpeningBalance,
        totalIncome: inputs.totalCashIncome,
        totalExpenses: inputs.totalCashExpenses,
        balance: cashBalance,
      },
    });
  })
);
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: no errors in `balance.ts`/`storage/balance.ts` (reports.ts errors from Task 4 still pending, fixed next task).

- [ ] **Step 4: Commit**

```bash
git add server/storage/balance.ts server/routes/balance.ts
git commit -m "feat: report bank fund and cash fund balances separately"
```

---

### Task 6: Reports — data layer for both funds

**Files:**
- Modify: `server/storage/reports.ts`
- Modify: `server/routes/reports.ts`

**Interfaces:**
- Consumes: `cashFundIncome`, `cashFundExpenses` tables (Task 1); `settings.cashOpeningBalance` (Task 1); `computeBalance` (unchanged).
- Produces: `reportsStorage.getCashReportTotals`, `getCashPriorActivity`, `getCashFundEntriesInRange` — consumed by Task 7 (PDF) and by `buildReport()` in this task.
- Produces: `GET /api/reports?from&to` response gains a `cashFund` object (breaking addition — Mobile Task 7 depends on this).

- [ ] **Step 1: Add cash fund query functions**

In `server/storage/reports.ts`, update the import line to:

```ts
import { contributions, expenses, events, cashFundIncome, cashFundExpenses } from "@shared/schema";
```

Then append these functions at the end of the file:

```ts
export async function getCashReportTotals({ from, to }: ReportRange) {
  const [incomeRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(and(gte(cashFundIncome.date, from), lte(cashFundIncome.date, to)));

  const [offeringRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(and(gte(cashFundIncome.date, from), lte(cashFundIncome.date, to), eq(cashFundIncome.type, "offering")));

  const [donationRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(and(gte(cashFundIncome.date, from), lte(cashFundIncome.date, to), eq(cashFundIncome.type, "donation")));

  const [expenseRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundExpenses.amount}), 0)` })
    .from(cashFundExpenses)
    .where(and(gte(cashFundExpenses.date, from), lte(cashFundExpenses.date, to)));

  return {
    totalCashIncome: incomeRow.total,
    totalOffering: offeringRow.total,
    totalDonation: donationRow.total,
    totalCashExpenses: expenseRow.total,
  };
}

// Mirrors getPriorActivity() above, for the Cash Fund's rolling opening balance.
export async function getCashPriorActivity(before: string) {
  const [incomeRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundIncome.amount}), 0)` })
    .from(cashFundIncome)
    .where(lt(cashFundIncome.date, before));

  const [expenseRow] = await db
    .select({ total: sql<string>`coalesce(sum(${cashFundExpenses.amount}), 0)` })
    .from(cashFundExpenses)
    .where(lt(cashFundExpenses.date, before));

  return { totalCashIncome: incomeRow.total, totalCashExpenses: expenseRow.total };
}

export async function getCashFundEntriesInRange({ from, to }: ReportRange) {
  const income = await db
    .select()
    .from(cashFundIncome)
    .where(and(gte(cashFundIncome.date, from), lte(cashFundIncome.date, to)))
    .orderBy(cashFundIncome.date);

  const expenseRows = await db
    .select()
    .from(cashFundExpenses)
    .where(and(gte(cashFundExpenses.date, from), lte(cashFundExpenses.date, to)))
    .orderBy(cashFundExpenses.date);

  return { income, expenses: expenseRows };
}
```

- [ ] **Step 2: Wire cash fund data into `buildReport()`**

In `server/routes/reports.ts`, change the settings line inside `buildReport()`:

```ts
const inceptionBalance = settingsRow ? fromMoney(settingsRow.bankOpeningBalance) : 0;
```

(was `settingsRow.openingBalance` — this is the fix for the typecheck errors left by Task 4.)

Then, right before the function's `return` statement, insert:

```ts
  const cashInceptionBalance = settingsRow ? fromMoney(settingsRow.cashOpeningBalance) : 0;
  const cashPrior = await reportsStorage.getCashPriorActivity(from);
  const cashOpeningBalance = computeBalance({
    openingBalance: cashInceptionBalance,
    totalContributions: fromMoney(cashPrior.totalCashIncome),
    totalPaidExpenses: fromMoney(cashPrior.totalCashExpenses),
  });

  const cashTotals = await reportsStorage.getCashReportTotals({ from, to });
  const totalCashIncome = fromMoney(cashTotals.totalCashIncome);
  const totalOffering = fromMoney(cashTotals.totalOffering);
  const totalDonation = fromMoney(cashTotals.totalDonation);
  const totalCashExpenses = fromMoney(cashTotals.totalCashExpenses);
  const cashClosingBalance = computeBalance({
    openingBalance: cashOpeningBalance,
    totalContributions: totalCashIncome,
    totalPaidExpenses: totalCashExpenses,
  });

  const cashEntries = await reportsStorage.getCashFundEntriesInRange({ from, to });
```

And change the `return` statement to add a `cashFund` field:

```ts
  return {
    from,
    to,
    openingBalance,
    totalContributions,
    totalPaidExpenses,
    totalPendingExpenses,
    closingBalance,
    expenses: expenseRows,
    contributions: contributionRows.map((c) => ({
      memberName: memberNameById.get(c.memberId) ?? "Unknown",
      amount: c.amount,
      date: c.date,
      note: c.note,
    })),
    cashFund: {
      openingBalance: cashOpeningBalance,
      totalIncome: totalCashIncome,
      totalOffering,
      totalDonation,
      totalExpenses: totalCashExpenses,
      closingBalance: cashClosingBalance,
      income: cashEntries.income,
      expenses: cashEntries.expenses,
    },
  };
```

- [ ] **Step 3: Serialize `cashFund` amounts in the JSON route**

In the `reportsRouter.get("/", ...)` handler, change the `res.json(...)` call to:

```ts
    res.json({
      ...report,
      expenses: report.expenses.map((e) => ({ ...e, amount: fromMoney(e.amount) })),
      contributions: report.contributions.map((c) => ({ ...c, amount: fromMoney(c.amount) })),
      cashFund: {
        ...report.cashFund,
        income: report.cashFund.income.map((i) => ({ ...i, amount: fromMoney(i.amount) })),
        expenses: report.cashFund.expenses.map((e) => ({ ...e, amount: fromMoney(e.amount) })),
      },
    });
```

(The `/pdf` route is untouched here — `report` still carries raw string amounts for `generateReportPdf`, updated in Task 7.)

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: errors only in `server/lib/pdf.ts` (its `ReportPdfData` type doesn't have `cashFund` yet) — fixed in Task 7.

- [ ] **Step 5: Commit**

```bash
git add server/storage/reports.ts server/routes/reports.ts
git commit -m "feat: include cash fund totals and entries in reports"
```

---

### Task 7: Reports — Cash Fund section in the PDF

**Files:**
- Modify: `server/lib/pdf.ts`

**Interfaces:**
- Consumes: `report.cashFund` (Task 6, matches the `ReportPdfData["cashFund"]` shape defined here).
- Produces: extended `ReportPdfData` type (breaking addition — `routes/reports.ts`'s `/pdf` handler already passes the full `report` object, so no caller change needed there).

- [ ] **Step 1: Extend `ReportPdfData`**

In `server/lib/pdf.ts`, replace the `ReportPdfData` type with:

```ts
export type ReportPdfData = {
  from: string;
  to: string;
  openingBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
  closingBalance: number;
  expenses: { eventName: string | null; description: string; amount: string; status: string; date: string }[];
  contributions: { memberName: string; amount: string; date: string; note: string | null }[];
  cashFund: {
    openingBalance: number;
    totalIncome: number;
    totalOffering: number;
    totalDonation: number;
    totalExpenses: number;
    closingBalance: number;
    income: { type: string; amount: string; date: string; donorName: string | null; note: string | null }[];
    expenses: { description: string; amount: string; date: string }[];
  };
};
```

- [ ] **Step 2: Add a Cash Fund ledger row builder**

Immediately after `buildLedgerRows()`, add:

```ts
// Same LedgerRow shape as the bank ledger, reusing drawLedgerTable() below.
// Cash Fund has no pending state, so every debit reduces the running
// balance immediately (unlike buildLedgerRows(), which checks status).
function buildCashLedgerRows(data: ReportPdfData["cashFund"]): LedgerRow[] {
  type UnbalancedRow = Omit<LedgerRow, "balance"> & { order: number };
  const rows: UnbalancedRow[] = [];

  data.income.forEach((inc, i) => {
    const label = inc.type === "donation" ? "Donation" : "Offering";
    const who = inc.type === "donation" && inc.donorName ? ` - ${inc.donorName}` : "";
    const noteSuffix = inc.note ? ` (${inc.note})` : "";
    rows.push({
      date: inc.date,
      description: `${label}${who}${noteSuffix}`,
      credit: fromMoney(inc.amount),
      debit: 0,
      status: "Received",
      order: i,
    });
  });

  data.expenses.forEach((e, i) => {
    rows.push({
      date: e.date,
      description: e.description,
      credit: 0,
      debit: fromMoney(e.amount),
      status: "Paid",
      order: data.income.length + i,
    });
  });

  rows.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date.localeCompare(b.date)));

  let balance = data.openingBalance;
  return rows.map((r) => {
    balance += r.credit;
    balance -= r.debit;
    return { ...r, balance };
  });
}
```

- [ ] **Step 3: Render the Cash Fund section in `generateReportPdf`**

In `generateReportPdf`, right before `doc.end();`, insert:

```ts
    doc.moveDown(1.5);
    doc.fontSize(13).text("Cash Fund (Offering & Donation)");
    doc.fontSize(11);
    doc.text(`Opening balance: Rs. ${data.cashFund.openingBalance.toFixed(2)}`);
    doc.text(`Offering received: Rs. ${data.cashFund.totalOffering.toFixed(2)}`);
    doc.text(`Donations received: Rs. ${data.cashFund.totalDonation.toFixed(2)}`);
    doc.text(`Expenses: Rs. ${data.cashFund.totalExpenses.toFixed(2)}`);
    doc.font("Helvetica-Bold").text(`Closing balance: Rs. ${data.cashFund.closingBalance.toFixed(2)}`);
    doc.font("Helvetica");
    doc.moveDown(1);
    doc.fontSize(9);
    drawLedgerTable(doc, buildCashLedgerRows(data.cashFund));
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors anywhere in the backend.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass (schema, balance, money, parseId, auth).

- [ ] **Step 6: Manual smoke test**

With the dev server running and at least one cash income/expense row seeded (Task 2/3 smoke tests), fetch a PDF and confirm it opens and shows a second "Cash Fund" section:

```bash
curl -s "localhost:5000/api/reports/pdf?from=2026-01-01&to=2026-12-31" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/report.pdf
```

- [ ] **Step 7: Commit**

```bash
git add server/lib/pdf.ts
git commit -m "feat: add cash fund section to the report PDF"
```

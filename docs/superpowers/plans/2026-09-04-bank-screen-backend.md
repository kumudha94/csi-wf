# CSI-WF Bank Screen Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bank Fund's "General Expenses" concept with a unified `bank_transactions` ledger (deposit/withdrawal/cash_expense) modeling the real deposit → withdraw-to-hand → spend → redeposit cycle, and replace one-at-a-time contribution entry with a collection-status endpoint plus a gap-filling "collect" endpoint for members who pay in irregular multi-month gaps.

**Architecture:** One new resource table (`bank_transactions`) and its storage/route modules, mirroring `cashFundIncome`/`cashFundExpenses` exactly. `contributions` gains a `forMonth` column (separate from `date`) so a single payment can cover multiple calendar months. Two new pure-logic helpers (`getDepositWindow` in `dateRange.ts`, `getMissingMonths`/`splitAmountAcrossMonths` in a new `contributionMonths.ts`) drive the deposit-status check and the gap-fill split respectively. `/api/balance` and `/api/dashboard` are rewritten to compute Bank Balance and Balance in Hand from `bank_transactions` instead of `contributions`/`expenses`, reusing the existing `computeBalance()` shape for both (it's the same additive/subtractive formula either way).

**Tech Stack:** Express 4, TypeScript 5, Drizzle ORM, Postgres (Neon), zod, vitest — same stack as the existing backend, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-bank-screen-design.md`

**Depends on:** nothing outstanding — this is the first plan for this spec. The paired mobile plan (`docs/superpowers/plans/2026-09-04-bank-screen-mobile.md`) depends on this one: its Tasks consuming `/api/balance`, `/api/bank-transactions`, `/api/contributions/collection-status`, `/api/contributions/collect`, and `/api/dashboard` need this plan deployed (or running locally) first.

## Global Constraints

- Money is stored as Postgres `numeric(10,2)` (string at the DB boundary). Conversion happens only via `toMoney`/`fromMoney` in `server/lib/money.ts` — never inline.
- Bank Balance formula (from spec): `Bank Balance = bankOpeningBalance + Σ(deposit) − Σ(withdrawal)`. This is the same additive/subtractive shape as `computeBalance({ openingBalance, totalContributions, totalPaidExpenses })` — reuse it directly (deposits as `totalContributions`, withdrawals as `totalPaidExpenses`), don't write a second formula function.
- Balance in Hand formula (from spec, **critical — event expenses draw from hand, never the bank directly**): `Balance in Hand = Σ(withdrawal) − Σ(cash_expense) − Σ(expenses WHERE event_id IS NOT NULL AND status='paid')`. Also expressible via `computeBalance({ openingBalance: 0, totalContributions: totalWithdrawals, totalPaidExpenses: totalCashExpense + totalEventExpensesPaid })` — reuse it again rather than writing a third formula.
- Dates are `YYYY-MM-DD` strings validated by the existing `dateStringSchema` (`shared/schema.ts`). `forMonth` uses the same format, always the 1st of the month (e.g. `2026-09-01`).
- Every route handler is wrapped with `wrap()` from `server/lib/asyncHandler.ts`; zod parse errors surface as 400 via the shared error middleware — never ad-hoc try/catch.
- `@shared/*` resolves to `./shared/*`.
- Every new resource router is mounted under `requireAuth` in `server/routes/index.ts`, matching every existing resource router.
- **Reports/PDF are explicitly out of scope** (confirmed with the project owner) — `server/routes/reports.ts`, `server/storage/reports.ts`, and `server/lib/pdf.ts` are not touched by this plan. They keep computing Bank Fund totals with the old `contributions`/`expenses.status='paid'` formula and will disagree with the new Bank Balance until Reports' own dedicated enhancement phase. No task in this plan should modify those three files.
- **`contributions` gains a `NOT NULL` column with no default.** Per the project owner, existing `contributions` rows are test data, confirmed safe to discard. Task 1 includes truncating the table before `db:push` so drizzle-kit's non-interactive push (used in the Render `buildCommand`) doesn't hit a column it can't add without a default.
- Event-scoped expenses (`expenses` where `event_id` is set) are **not modified by this plan** — same table, same `paid`/`pending` status, same routes. Only how their *paid* total feeds into Balance in Hand changes.

---

### Task 1: Schema — `bank_transactions` table and `contributions.forMonth`

**Files:**
- Modify: `shared/schema.ts`
- Modify: `shared/schema.test.ts`

**Interfaces:**
- Produces: `bankTransactions` table, `BankTransaction`, `BankTransactionInput`, `insertBankTransactionSchema`, `BANK_TRANSACTION_TYPES`, `BankTransactionType` — used by Task 3.
- Produces: `contributions.forMonth` column, updated `ContributionInput`/`insertContributionSchema` — used by Tasks 5, 6.
- Produces: `collectContributionSchema`, `CollectContributionInput` — used by Task 5.

- [ ] **Step 1: Write the failing schema tests**

Add to `shared/schema.test.ts`, updating the import line at the top to include the new exports:

```ts
import {
  insertMemberSchema,
  insertAttributeDefinitionSchema,
  insertEventSchema,
  insertExpenseSchema,
  insertContributionSchema,
  collectContributionSchema,
  insertCashFundIncomeSchema,
  insertCashFundExpenseSchema,
  insertBankTransactionSchema,
} from "./schema";
```

Replace the existing `describe("insertContributionSchema", ...)` block with:

```ts
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
```

Add at the end of the file:

```ts
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
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npm test -- schema.test.ts`
Expected: FAIL — `insertBankTransactionSchema`/`collectContributionSchema` are not exported, and the `insertContributionSchema` test fails on the missing `forMonth` requirement.

- [ ] **Step 3: Add `bank_transactions` and extend `contributions`**

In `shared/schema.ts`, replace the entire `// ---------- contributions ----------` section with:

```ts
// ---------- contributions ----------
export const contributions = pgTable("contributions", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  // Which calendar month this payment counts toward (always the 1st of the
  // month), distinct from `date` (when it was physically paid). A single
  // gap-clearing payment produces multiple rows: same date, one row per
  // covered forMonth.
  forMonth: varchar("for_month", { length: 10 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type Contribution = typeof contributions.$inferSelect;

export const insertContributionSchema = z.object({
  memberId: z.coerce.number().int().positive("A member must be selected"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: dateStringSchema,
  forMonth: dateStringSchema,
  note: z.string().nullable().optional(),
});
export type ContributionInput = z.infer<typeof insertContributionSchema>;

// Used by POST /api/contributions/collect: a lump-sum payment that may
// cover several unpaid months at once. The server computes which months
// are owed and splits totalAmount across them — see
// server/lib/contributionMonths.ts.
export const collectContributionSchema = z.object({
  memberId: z.coerce.number().int().positive("A member must be selected"),
  totalAmount: z.coerce.number().positive("Amount must be greater than 0"),
  date: dateStringSchema,
});
export type CollectContributionInput = z.infer<typeof collectContributionSchema>;

// ---------- bank_transactions ----------
export const BANK_TRANSACTION_TYPES = ["deposit", "withdrawal", "cash_expense"] as const;
export type BankTransactionType = (typeof BANK_TRANSACTION_TYPES)[number];

export const bankTransactions = pgTable("bank_transactions", {
  id: serial("id").primaryKey(),
  // deposit = money moved into the bank (e.g. depositing collected
  // contributions, or redepositing leftover in-hand cash). withdrawal =
  // money taken out of the bank into hand, for an upcoming event.
  // cash_expense = money spent from the in-hand cash.
  type: varchar("type", { length: 20 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  receiptPhotoUrl: varchar("receipt_photo_url", { length: 500 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type BankTransaction = typeof bankTransactions.$inferSelect;

export const insertBankTransactionSchema = z.object({
  type: z.enum(BANK_TRANSACTION_TYPES),
  description: z.string().min(1, "Description is required").max(255),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: dateStringSchema,
  receiptPhotoUrl: z.string().url().nullable().optional(),
});
export type BankTransactionInput = z.infer<typeof insertBankTransactionSchema>;
```

(Leave `// ---------- cash_fund_income ----------` and everything after it exactly where it is, right after this block.)

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npm test -- schema.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts shared/schema.test.ts
git commit -m "feat: add bank_transactions schema and contributions.forMonth"
```

- [ ] **Step 6: Truncate test data and push the schema**

`contributions` is getting a `NOT NULL` column with no default. Per the project owner, existing rows are test data, confirmed safe to discard — truncate before pushing so `drizzle-kit push` (non-interactive, used by the Render `buildCommand`) doesn't need to prompt for a default:

```bash
psql "$DATABASE_URL" -c "TRUNCATE TABLE contributions;"
npm run db:push
```

Expected: push completes non-interactively (`bank_transactions` is a brand-new table so it needs no prompt either).

---

### Task 2: `dateRange` — deposit-status window

**Files:**
- Modify: `server/lib/dateRange.ts`
- Modify: `server/lib/dateRange.test.ts` (create if it doesn't exist — check first: no test file exists for this module today, so this task creates one)

**Interfaces:**
- Produces: `getDepositWindow(date: Date): DateRange` — consumed by Tasks 4 and 7.
- Consumes: `DateRange` (existing type, unchanged), `pad` (existing private helper, unchanged).

- [ ] **Step 1: Write the failing test**

Create `server/lib/dateRange.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npm test -- dateRange.test.ts`
Expected: FAIL — `getDepositWindow` is not exported from `./dateRange`.

- [ ] **Step 3: Add `getDepositWindow`**

In `server/lib/dateRange.ts`, append after `getWeekOfMonthRange`:

```ts
// The window a deposit must land in to count as "this month's contributions
// were deposited" -- the month itself, or the following month (treasurers
// commonly deposit a month's collected cash early the next month rather
// than same-day).
export function getDepositWindow(date: Date): DateRange {
  const year = date.getFullYear();
  const month = date.getMonth();
  const from = `${year}-${pad(month + 1)}-01`;

  const nextMonthDate = new Date(year, month + 1, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth();
  const nextMonthLastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
  const to = `${nextYear}-${pad(nextMonth + 1)}-${pad(nextMonthLastDay)}`;

  return { from, to };
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npm test -- dateRange.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/dateRange.ts server/lib/dateRange.test.ts
git commit -m "feat: add deposit-status window helper"
```

---

### Task 3: `bank_transactions` — storage, routes, registration

**Files:**
- Create: `server/storage/bankTransactions.ts`
- Create: `server/routes/bankTransactions.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `bankTransactions`, `BankTransaction`, `BankTransactionInput`, `insertBankTransactionSchema` (Task 1); `toMoney`/`fromMoney`; `wrap`; `parseId`.
- Produces: `bankTransactionsRouter`, mounted at `/api/bank-transactions` (`GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`) — consumed by the mobile plan. `hasDepositInRange(from: string, to: string): Promise<boolean>` — consumed by Tasks 4 and 7.

- [ ] **Step 1: Create the storage module**

`server/storage/bankTransactions.ts`:

```ts
import { db } from "../db";
import { bankTransactions, type BankTransaction, type BankTransactionInput } from "@shared/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function listBankTransactions(): Promise<BankTransaction[]> {
  return db.select().from(bankTransactions).orderBy(desc(bankTransactions.date));
}

export async function createBankTransaction(data: BankTransactionInput): Promise<BankTransaction> {
  const [row] = await db
    .insert(bankTransactions)
    .values({ ...data, amount: toMoney(data.amount) })
    .returning();
  return row;
}

export async function updateBankTransaction(
  id: number,
  data: Partial<BankTransactionInput>
): Promise<BankTransaction | null> {
  const { amount, ...rest } = data;
  const [row] = await db
    .update(bankTransactions)
    .set({ ...rest, ...(amount !== undefined ? { amount: toMoney(amount) } : {}) })
    .where(eq(bankTransactions.id, id))
    .returning();
  return row ?? null;
}

export async function deleteBankTransaction(id: number): Promise<boolean> {
  const result = await db
    .delete(bankTransactions)
    .where(eq(bankTransactions.id, id))
    .returning({ id: bankTransactions.id });
  return result.length > 0;
}

// Powers the "[Month] deposit completed/pending" status line on the Bank
// screen and Dashboard: a simple existence check, no amount reconciliation.
export async function hasDepositInRange(from: string, to: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bankTransactions.id })
    .from(bankTransactions)
    .where(and(eq(bankTransactions.type, "deposit"), gte(bankTransactions.date, from), lte(bankTransactions.date, to)))
    .limit(1);
  return !!row;
}
```

- [ ] **Step 2: Create the route module**

`server/routes/bankTransactions.ts`:

```ts
import { Router } from "express";
import { insertBankTransactionSchema, type BankTransaction } from "@shared/schema";
import * as bankTransactionsStorage from "../storage/bankTransactions";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";
import { parseId } from "../lib/parseId";

export const bankTransactionsRouter = Router();

function serialize(row: BankTransaction) {
  return { ...row, amount: fromMoney(row.amount) };
}

bankTransactionsRouter.get(
  "/",
  wrap(async (_req, res) => {
    const list = await bankTransactionsStorage.listBankTransactions();
    res.json(list.map(serialize));
  })
);

bankTransactionsRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertBankTransactionSchema.parse(req.body);
    const row = await bankTransactionsStorage.createBankTransaction(data);
    res.status(201).json(serialize(row));
  })
);

bankTransactionsRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const data = insertBankTransactionSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const row = await bankTransactionsStorage.updateBankTransaction(id, data);
    if (!row) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json(serialize(row));
  })
);

bankTransactionsRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await bankTransactionsStorage.deleteBankTransaction(id);
    if (!deleted) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.status(204).send();
  })
);
```

- [ ] **Step 3: Register the router**

In `server/routes/index.ts`, add the import next to the other resource routers:

```ts
import { bankTransactionsRouter } from "./bankTransactions";
```

And the mount, next to `contributionsRouter`:

```ts
app.use("/api/bank-transactions", requireAuth, bankTransactionsRouter);
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev` (one terminal), then in another:

```bash
TOKEN=<a valid bearer token from /api/auth/login>
curl -s -X POST localhost:5000/api/bank-transactions \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"deposit","description":"August contributions deposited","amount":15000,"date":"2026-09-04"}'
curl -s localhost:5000/api/bank-transactions -H "Authorization: Bearer $TOKEN"
```

Expected: POST returns 201 with `amount: 15000` (a number); GET returns an array containing that row.

- [ ] **Step 6: Commit**

```bash
git add server/storage/bankTransactions.ts server/routes/bankTransactions.ts server/routes/index.ts
git commit -m "feat: add bank_transactions resource"
```

---

### Task 4: Balance — Bank Balance, Balance in Hand, deposit status

**Files:**
- Modify: `server/storage/balance.ts`
- Modify: `server/routes/balance.ts`

**Interfaces:**
- Consumes: `bankTransactions` table (Task 1); `hasDepositInRange` (Task 3); `getDepositWindow`, `getMonthLabel` (Task 2, existing); `computeBalance` (`server/lib/balance.ts`, unchanged).
- Produces: `GET /api/balance` → new `bankFund` shape (breaking change — mobile plan Task 5 depends on this): `{ openingBalance, totalDeposits, totalWithdrawals, balance, balanceInHand, depositStatus: { monthLabel, completed } }`. `cashFund` shape is unchanged.

- [ ] **Step 1: Update balance storage**

Replace the contents of `server/storage/balance.ts`:

```ts
import { db } from "../db";
import { bankTransactions, expenses, settings, cashFundIncome, cashFundExpenses } from "@shared/schema";
import { sql, eq, isNotNull, and } from "drizzle-orm";
import { fromMoney } from "../lib/money";

export type BalanceInputs = {
  bankOpeningBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalCashExpenseFromHand: number;
  totalEventExpensesPaid: number;
  cashOpeningBalance: number;
  totalCashIncome: number;
  totalCashExpenses: number;
};

export async function getBalanceInputs(): Promise<BalanceInputs> {
  const [settingsRow] = await db.select().from(settings).limit(1);
  const bankOpeningBalance = settingsRow ? fromMoney(settingsRow.bankOpeningBalance) : 0;
  const cashOpeningBalance = settingsRow ? fromMoney(settingsRow.cashOpeningBalance) : 0;

  const [depositRow] = await db
    .select({ total: sql<string>`coalesce(sum(${bankTransactions.amount}), 0)` })
    .from(bankTransactions)
    .where(eq(bankTransactions.type, "deposit"));
  const totalDeposits = fromMoney(depositRow.total);

  const [withdrawalRow] = await db
    .select({ total: sql<string>`coalesce(sum(${bankTransactions.amount}), 0)` })
    .from(bankTransactions)
    .where(eq(bankTransactions.type, "withdrawal"));
  const totalWithdrawals = fromMoney(withdrawalRow.total);

  const [cashExpenseFromHandRow] = await db
    .select({ total: sql<string>`coalesce(sum(${bankTransactions.amount}), 0)` })
    .from(bankTransactions)
    .where(eq(bankTransactions.type, "cash_expense"));
  const totalCashExpenseFromHand = fromMoney(cashExpenseFromHandRow.total);

  // Event spending is always funded from withdrawn cash-in-hand, never paid
  // directly from the bank -- so paid event expenses reduce Balance in
  // Hand, not Bank Balance. `event_id IS NOT NULL` is defensive: no new
  // eventId-null ("general") expense rows get created after this ships,
  // but this guards against any stray ones.
  const [eventExpensesPaidRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(isNotNull(expenses.eventId), eq(expenses.status, "paid")));
  const totalEventExpensesPaid = fromMoney(eventExpensesPaidRow.total);

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
    totalDeposits,
    totalWithdrawals,
    totalCashExpenseFromHand,
    totalEventExpensesPaid,
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
import { hasDepositInRange } from "../storage/bankTransactions";
import { computeBalance } from "../lib/balance";
import { getDepositWindow, getMonthLabel } from "../lib/dateRange";

export const balanceRouter = Router();

balanceRouter.get(
  "/",
  wrap(async (_req, res) => {
    const inputs = await getBalanceInputs();

    const bankBalance = computeBalance({
      openingBalance: inputs.bankOpeningBalance,
      totalContributions: inputs.totalDeposits,
      totalPaidExpenses: inputs.totalWithdrawals,
    });
    const balanceInHand = computeBalance({
      openingBalance: 0,
      totalContributions: inputs.totalWithdrawals,
      totalPaidExpenses: inputs.totalCashExpenseFromHand + inputs.totalEventExpensesPaid,
    });
    // Cash Fund is unchanged by this plan -- same formula shape as before.
    const cashBalance = computeBalance({
      openingBalance: inputs.cashOpeningBalance,
      totalContributions: inputs.totalCashIncome,
      totalPaidExpenses: inputs.totalCashExpenses,
    });

    const now = new Date();
    const depositWindow = getDepositWindow(now);
    const depositCompleted = await hasDepositInRange(depositWindow.from, depositWindow.to);

    res.json({
      bankFund: {
        openingBalance: inputs.bankOpeningBalance,
        totalDeposits: inputs.totalDeposits,
        totalWithdrawals: inputs.totalWithdrawals,
        balance: bankBalance,
        balanceInHand,
        depositStatus: { monthLabel: getMonthLabel(now), completed: depositCompleted },
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
Expected: errors in `server/storage/dashboard.ts` (still references the old `BalanceInputs` field names `totalContributions`/`totalPaidExpenses`/`totalPendingExpenses`) — expected, fixed in Task 7. No errors in `balance.ts`/`storage/balance.ts` themselves.

- [ ] **Step 4: Manual smoke test**

With the dev server running and at least one deposit/withdrawal/cash_expense row seeded (Task 3's smoke test), fetch balance:

```bash
curl -s localhost:5000/api/balance -H "Authorization: Bearer $TOKEN"
```

Expected: `bankFund.balance`, `bankFund.balanceInHand`, and `bankFund.depositStatus` all present and numerically correct given the seeded rows.

- [ ] **Step 5: Commit**

```bash
git add server/storage/balance.ts server/routes/balance.ts
git commit -m "feat: compute bank balance and balance-in-hand from bank_transactions"
```

---

### Task 5: `contributionMonths` — gap-fill logic (pure, unit-tested)

**Files:**
- Create: `server/lib/contributionMonths.ts`
- Create: `server/lib/contributionMonths.test.ts`

**Interfaces:**
- Produces: `getMissingMonths(memberCreatedAt: Date, now: Date, paidMonths: Set<string>): string[]`, `splitAmountAcrossMonths(totalAmount: number, months: string[]): { forMonth: string; amount: number }[]`, `monthString(date: Date): string` — all consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

`server/lib/contributionMonths.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npm test -- contributionMonths.test.ts`
Expected: FAIL — `./contributionMonths` doesn't exist yet.

- [ ] **Step 3: Implement the module**

`server/lib/contributionMonths.ts`:

```ts
function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function monthString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Every calendar month from the later of (this year's Jan 1, the member's
 * join month) up to and including `now`'s month, that has no entry in
 * `paidMonths` -- in chronological order, current month last. Bounds gap
 * calculation to the current calendar year even for members who joined
 * earlier, matching how the Contributions tab frames "this year's dues."
 */
export function getMissingMonths(memberCreatedAt: Date, now: Date, paidMonths: Set<string>): string[] {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const joinMonth = monthStart(memberCreatedAt);
  const earliest = joinMonth > yearStart ? joinMonth : yearStart;
  const current = monthStart(now);

  const months: string[] = [];
  let cursor = earliest;
  while (cursor <= current) {
    const monthStr = monthString(cursor);
    if (!paidMonths.has(monthStr)) months.push(monthStr);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

/**
 * Splits a lump-sum payment evenly (2-decimal rupees) across the months it
 * covers. Any leftover paisa from a non-divisible amount (e.g. Rs.250
 * across 3 months) is added to the last month in `months` -- the most
 * recent one, per the gap-fill rule in the design spec.
 */
export function splitAmountAcrossMonths(
  totalAmount: number,
  months: string[]
): { forMonth: string; amount: number }[] {
  const base = Math.floor((totalAmount / months.length) * 100) / 100;
  const distributed = Math.round(base * (months.length - 1) * 100) / 100;
  const lastAmount = Math.round((totalAmount - distributed) * 100) / 100;

  return months.map((forMonth, i) => ({
    forMonth,
    amount: i === months.length - 1 ? lastAmount : base,
  }));
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npm test -- contributionMonths.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add server/lib/contributionMonths.ts server/lib/contributionMonths.test.ts
git commit -m "feat: add contribution gap-fill month/split logic"
```

---

### Task 6: Contributions — collection-status and collect endpoints

**Files:**
- Modify: `server/storage/contributions.ts`
- Modify: `server/routes/contributions.ts`

**Interfaces:**
- Consumes: `getMissingMonths`, `splitAmountAcrossMonths`, `monthString` (Task 5); `collectContributionSchema` (Task 1); `members` table (existing).
- Produces: `GET /api/contributions/collection-status` → `MemberCollectionStatus[]`; `POST /api/contributions/collect` → `Contribution[]` (201) — both consumed by the mobile plan's `ContributionCollectForm`.

- [ ] **Step 1: Add storage functions**

In `server/storage/contributions.ts`, update the imports and append the new functions:

```ts
import { db } from "../db";
import { contributions, members, type Contribution, type ContributionInput } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { toMoney, fromMoney } from "../lib/money";
import { getMissingMonths, splitAmountAcrossMonths, monthString } from "../lib/contributionMonths";

// ... (listContributions, createContribution, updateContribution, deleteContribution stay unchanged) ...

export type MemberCollectionStatus = {
  memberId: number;
  name: string;
  santhaNumber: string;
  defaultAmount: number;
  paidThisMonth: boolean;
  currentMonthContributionId: number | null;
  currentMonthAmount: number | null;
  currentMonthDate: string | null;
  missingMonths: string[];
};

// Active members only -- inactive/died members don't appear in the
// collection flow. `now` is a parameter (defaulting to the real clock) so
// this is testable without mocking global time.
export async function getCollectionStatus(now: Date = new Date()): Promise<MemberCollectionStatus[]> {
  const yearStart = monthString(new Date(now.getFullYear(), 0, 1));
  const currentMonth = monthString(now);

  const memberRows = await db
    .select({
      id: members.id,
      name: members.name,
      santhaNumber: members.santhaNumber,
      defaultAmount: members.defaultAmount,
      createdAt: members.createdAt,
    })
    .from(members)
    .where(eq(members.status, "active"));

  const contributionRows = await db.select().from(contributions).where(gte(contributions.forMonth, yearStart));

  const byMember = new Map<number, Contribution[]>();
  for (const row of contributionRows) {
    const list = byMember.get(row.memberId) ?? [];
    list.push(row);
    byMember.set(row.memberId, list);
  }

  return memberRows.map((member) => {
    const memberContributions = byMember.get(member.id) ?? [];
    const paidMonths = new Set(memberContributions.map((c) => c.forMonth));
    const missingMonths = getMissingMonths(member.createdAt, now, paidMonths);
    const currentRow = memberContributions.find((c) => c.forMonth === currentMonth) ?? null;

    return {
      memberId: member.id,
      name: member.name,
      santhaNumber: member.santhaNumber,
      defaultAmount: fromMoney(member.defaultAmount),
      paidThisMonth: !!currentRow,
      currentMonthContributionId: currentRow?.id ?? null,
      currentMonthAmount: currentRow ? fromMoney(currentRow.amount) : null,
      currentMonthDate: currentRow?.date ?? null,
      missingMonths,
    };
  });
}

export async function collectContribution(
  memberId: number,
  totalAmount: number,
  date: string
): Promise<Contribution[]> {
  const [member] = await db.select({ createdAt: members.createdAt }).from(members).where(eq(members.id, memberId));
  if (!member) throw new Error("MEMBER_NOT_FOUND");

  const now = new Date();
  const yearStart = monthString(new Date(now.getFullYear(), 0, 1));
  const existingRows = await db
    .select({ forMonth: contributions.forMonth })
    .from(contributions)
    .where(and(eq(contributions.memberId, memberId), gte(contributions.forMonth, yearStart)));
  const paidMonths = new Set(existingRows.map((r) => r.forMonth));

  const missingMonths = getMissingMonths(member.createdAt, now, paidMonths);
  if (missingMonths.length === 0) throw new Error("NOTHING_OWED");

  const splits = splitAmountAcrossMonths(totalAmount, missingMonths);
  const rows = splits.map(({ forMonth, amount }) => ({
    memberId,
    forMonth,
    date,
    amount: toMoney(amount),
    note: null,
  }));

  return db.insert(contributions).values(rows).returning();
}
```

- [ ] **Step 2: Add the routes**

In `server/routes/contributions.ts`, update the import line and add the two new routes (before the `contributionsRouter.get("/", ...)` block, so `/collection-status` is registered — order doesn't strictly matter here since the paths are distinct, but keeping the more specific routes near the top matches the file's existing readability):

```ts
import { Router } from "express";
import { insertContributionSchema, collectContributionSchema, type Contribution } from "@shared/schema";
import * as contributionsStorage from "../storage/contributions";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";
import { parseId } from "../lib/parseId";

export const contributionsRouter = Router();

function serializeContribution(contribution: Contribution) {
  return { ...contribution, amount: fromMoney(contribution.amount) };
}

contributionsRouter.get(
  "/collection-status",
  wrap(async (_req, res) => {
    const status = await contributionsStorage.getCollectionStatus();
    res.json(status);
  })
);

contributionsRouter.post(
  "/collect",
  wrap(async (req, res) => {
    const data = collectContributionSchema.parse(req.body);
    try {
      const rows = await contributionsStorage.collectContribution(data.memberId, data.totalAmount, data.date);
      res.status(201).json(rows.map(serializeContribution));
    } catch (error: any) {
      if (error.message === "MEMBER_NOT_FOUND") {
        res.status(400).json({ error: "That member does not exist" });
        return;
      }
      if (error.message === "NOTHING_OWED") {
        res.status(400).json({ error: "This member has already paid for the current month" });
        return;
      }
      throw error;
    }
  })
);

// ... (the existing GET "/", POST "/", PATCH "/:id", DELETE "/:id" handlers stay unchanged below) ...
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

With the dev server running and at least one active member seeded:

```bash
curl -s localhost:5000/api/contributions/collection-status -H "Authorization: Bearer $TOKEN"
```

Expected: an array with one entry per active member, each showing `missingMonths` covering January through the current month (since no contributions exist yet).

```bash
MEMBER_ID=<an id from the previous response>
curl -s -X POST localhost:5000/api/contributions/collect \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"memberId\":$MEMBER_ID,\"totalAmount\":300,\"date\":\"2026-09-04\"}"
```

Expected: 201 with one row per missing month for that member, amounts summing to 300. Re-fetching `/collection-status` shows that member's `paidThisMonth: true` and a shorter (or empty) `missingMonths`.

- [ ] **Step 5: Commit**

```bash
git add server/storage/contributions.ts server/routes/contributions.ts
git commit -m "feat: add contribution collection-status and gap-fill collect endpoint"
```

---

### Task 7: Dashboard — Bank Balance, Balance in Hand, deposit status

**Files:**
- Modify: `server/storage/dashboard.ts`

**Interfaces:**
- Consumes: `getBalanceInputs` (Task 4, new shape); `hasDepositInRange` (Task 3); `getDepositWindow` (Task 2); `computeBalance` (unchanged).
- Produces: `getDashboardSummary()` return type's `bank` field changes from `{ balance, pending }` to `{ balance, inHand, depositStatus: { monthLabel, completed } }` — breaking change, mobile plan Task 7 depends on this.

- [ ] **Step 1: Update the bank balance computation**

In `server/storage/dashboard.ts`, update the import line:

```ts
import { db } from "../db";
import { members, contributions, cashFundIncome, type MemberStatus } from "@shared/schema";
import { sql, gte, lte, and, eq } from "drizzle-orm";
import { fromMoney } from "../lib/money";
import { computeBalance } from "../lib/balance";
import { getBalanceInputs } from "./balance";
import { hasDepositInRange } from "./bankTransactions";
import { getMonthLabel, getMonthRange, getMonthStart, getWeekOfMonthRange, getDepositWindow } from "../lib/dateRange";
```

Replace the `bankBalance`/`cashBalance` block near the top of `getDashboardSummary()`:

```ts
  const balanceInputs = await getBalanceInputs();
  const bankBalance = computeBalance({
    openingBalance: balanceInputs.bankOpeningBalance,
    totalContributions: balanceInputs.totalDeposits,
    totalPaidExpenses: balanceInputs.totalWithdrawals,
  });
  const balanceInHand = computeBalance({
    openingBalance: 0,
    totalContributions: balanceInputs.totalWithdrawals,
    totalPaidExpenses: balanceInputs.totalCashExpenseFromHand + balanceInputs.totalEventExpensesPaid,
  });
  const cashBalance = computeBalance({
    openingBalance: balanceInputs.cashOpeningBalance,
    totalContributions: balanceInputs.totalCashIncome,
    totalPaidExpenses: balanceInputs.totalCashExpenses,
  });
  const depositWindow = getDepositWindow(now);
  const depositCompleted = await hasDepositInRange(depositWindow.from, depositWindow.to);
```

(This replaces the old block that computed `bankBalance`/`cashBalance` from `totalContributions`/`totalPaidExpenses` — leave everything else in the function, including the `contributions`/`offering` this-month/this-week queries below it, exactly as it is.)

Update the final `return` statement's `bank` field:

```ts
  return {
    monthLabel,
    weekOfMonth: weekRange.weekNumber,
    bank: { balance: bankBalance, inHand: balanceInHand, depositStatus: { monthLabel, completed: depositCompleted } },
    cash: { balance: cashBalance },
    members: {
      total: statusCounts.reduce((sum, row) => sum + row.count, 0),
      active: countByStatus.active ?? 0,
      inactive: countByStatus.inactive ?? 0,
      died: countByStatus.died ?? 0,
      newThisMonth,
    },
    contributions: {
      thisMonth: fromMoney(contribMonth.total),
      thisWeek: fromMoney(contribWeek.total),
      total: balanceInputs.totalDeposits, // "total contributions" now tracked as deposits into the bank -- see note below
    },
    offering: {
      thisMonth: fromMoney(offeringMonth.total),
      thisWeek: fromMoney(offeringWeek.total),
      total: fromMoney(offeringTotal.total),
    },
  };
```

**Note on `contributions.total`:** the old value was `balanceInputs.totalContributions` (sum of all `contributions.amount`, regardless of deposit status) — that field no longer exists on `BalanceInputs`. `contributions.thisMonth`/`thisWeek` are untouched (still queried directly from the `contributions` table by `date`, unaffected by this plan). For `contributions.total` specifically, use `balanceInputs.totalDeposits` — this changes its meaning slightly (all-time contributions collected → all-time amount actually deposited to the bank), which is an accepted, minor side effect of removing `totalContributions` from `BalanceInputs`; do not add a redundant all-time contributions query solely to preserve the old number, since nothing in the spec asks for it and Dashboard's Contribution card is explicitly out of scope for redesign in this phase.

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: no errors anywhere in the backend.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass (schema, balance, money, parseId, auth, dateRange, contributionMonths).

- [ ] **Step 4: Manual smoke test**

```bash
curl -s localhost:5000/api/dashboard -H "Authorization: Bearer $TOKEN"
```

Expected: `bank.balance`, `bank.inHand`, and `bank.depositStatus` present and matching the `/api/balance` response from Task 4's smoke test.

- [ ] **Step 5: Commit**

```bash
git add server/storage/dashboard.ts
git commit -m "feat: compute dashboard bank balance and balance-in-hand from bank_transactions"
```

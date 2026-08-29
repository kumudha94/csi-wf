# CSI-WF Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CSI-WF treasurer API — members with extensible custom attributes, events with paid/pending expenses, member contributions, a computed balance, and exportable reports — as a standalone, curl-testable Express service.

**Architecture:** Node/Express + TypeScript on top of Drizzle ORM and Postgres (Neon), mirroring the existing `KitchenPlanner` backend's conventions (route/storage split, `wrap()` async handler, JWT bearer auth, Cloudinary for photo uploads). Single-user auth: one `auth_account` row protected by a PIN, no multi-user roles.

**Tech Stack:** Express 4, TypeScript 5, Drizzle ORM 0.39, `pg`, `jsonwebtoken`, `bcryptjs`, `multer` + `cloudinary`, `pdfkit`, `zod`, `vitest` for unit tests, deployed via Docker/Render.

**Spec:** `docs/superpowers/specs/2026-08-29-treasurer-app-design.md`

## Global Constraints

- Stack: Express + Drizzle ORM + Postgres (Neon) + JWT + bcryptjs + Cloudinary + pdfkit, deployed to Render (free tier) via Docker.
- Money is stored as Postgres `numeric(10,2)` (a string at the DB boundary in Drizzle's string-mode numeric columns — this Drizzle version has no numeric `mode: "number"` option). API request/response bodies always use plain JS numbers. Conversion happens **only** in `server/lib/money.ts` (`toMoney`/`fromMoney`) — never inline in routes or storage.
- Balance formula (fixed, from spec): `balance = openingBalance + Σcontributions − Σ(expenses where status = 'paid')`. Pending expenses never affect balance.
- Dates are stored and transmitted as `YYYY-MM-DD` strings, validated by regex. No timezone handling.
- Single-user auth: one `auth_account` row, PIN-based (bcrypt-hashed), JWT bearer tokens. No multi-user roles/permissions.
- Zod validation errors surface as `400` with a readable message via the shared error-handling middleware in `server/index.ts` — never ad-hoc try/catch per route.
- Currency is INR; the backend deals only in plain decimal numbers, formatting is a mobile concern.
- `@shared/*` import alias resolves to `./shared/*` (matches `tsconfig.json` paths, which `tsx` and `esbuild` both resolve automatically; `vitest.config.ts` sets the same alias explicitly since Vite does not auto-read tsconfig paths).

---

### Task 1: Project scaffold, health check, and error handling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `Dockerfile`
- Create: `render.yaml`
- Create: `vitest.config.ts`
- Create: `server/lib/asyncHandler.ts`
- Create: `server/routes/index.ts`
- Create: `server/index.ts`

**Interfaces:**
- Produces: `wrap(handler)` from `server/lib/asyncHandler.ts` — used by every route file in later tasks.
- Produces: `registerRoutes(app: Express): Promise<Server>` from `server/routes/index.ts` — later tasks add router mounts to this file.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "csi-wf-server",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "start": "NODE_ENV=production node dist/index.js",
    "check": "tsc --noEmit",
    "db:push": "drizzle-kit push",
    "test": "vitest run"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cloudinary": "^2.10.0",
    "cors": "^2.8.5",
    "dotenv": "^17.2.3",
    "drizzle-orm": "^0.39.3",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.3",
    "multer": "^2.2.0",
    "pdfkit": "^0.15.0",
    "pg": "^8.13.1",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.19",
    "@types/express": "4.17.21",
    "@types/jsonwebtoken": "^9.0.10",
    "@types/multer": "^2.2.0",
    "@types/node": "20.16.11",
    "@types/pdfkit": "^0.13.4",
    "@types/pg": "^8.11.10",
    "drizzle-kit": "^0.31.4",
    "esbuild": "^0.25.0",
    "tsx": "^4.20.5",
    "typescript": "5.6.3",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "include": ["shared/**/*", "server/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"],
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": "./node_modules/typescript/tsbuildinfo",
    "noEmit": true,
    "module": "ESNext",
    "strict": true,
    "lib": ["esnext"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "types": ["node"],
    "paths": {
      "@shared/*": ["./shared/*"]
    }
  }
}
```

- [ ] **Step 3: Create `.env.example`**

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
PORT=5000
JWT_SECRET=generate-a-long-random-string
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules
dist
.env
*.tsbuildinfo
```

- [ ] **Step 5: Create `Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 5000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 6: Create `render.yaml`**

```yaml
services:
  - type: web
    name: csi-wf-api
    runtime: node
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm run start
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        sync: false
      - key: CLOUDINARY_CLOUD_NAME
        sync: false
      - key: CLOUDINARY_API_KEY
        sync: false
      - key: CLOUDINARY_API_SECRET
        sync: false
```

- [ ] **Step 7: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 8: Create `server/lib/asyncHandler.ts`**

```ts
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async Express route handler so a rejected promise is forwarded to
 * `next()` instead of becoming an unhandled rejection. Express 4 does not do
 * this automatically for async handlers.
 */
export function wrap(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
```

- [ ] **Step 9: Create `server/routes/index.ts`**

```ts
import type { Express } from "express";
import { createServer, type Server } from "http";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return createServer(app);
}
```

- [ ] **Step 10: Create `server/index.ts`**

```ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { registerRoutes } from "./routes/index";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

const app = express();

// Auth is bearer-token, not cookie/session-based, so there's no ambient
// credential a cross-origin page could ride on — allowing any origin is
// safe here and needed since the mobile app has no origin at all.
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      console.log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues.map((issue) => issue.message).join("; ") });
      return;
    }
    const status = err.status || err.statusCode || 500;
    if (status >= 500) {
      console.error(err);
      res.status(status).json({ error: "Internal Server Error" });
      return;
    }
    res.status(status).json({ error: err.message || "Bad Request" });
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({ port, host: "0.0.0.0" }, () => {
    console.log(`CSI-WF API listening on port ${port}`);
  });
})();
```

- [ ] **Step 11: Install and verify**

```bash
npm install
npm run check
```

Expected: `tsc --noEmit` passes with no errors.

- [ ] **Step 12: Verify the server boots and health check responds**

```bash
npm run dev &
sleep 2
curl -s http://localhost:5000/api/health
kill %1
```

Expected: `{"status":"ok"}`

- [ ] **Step 13: Commit**

```bash
git add package.json tsconfig.json .env.example .gitignore Dockerfile render.yaml vitest.config.ts server
git commit -m "chore: scaffold CSI-WF backend with health check"
```

---

### Task 2: Money conversion utility

**Files:**
- Create: `server/lib/money.ts`
- Test: `server/lib/money.test.ts`

**Interfaces:**
- Produces: `toMoney(amount: number): string`, `fromMoney(value: string | number): number` — used by every storage module that touches an `amount`/`openingBalance` column from Task 6 onward.

- [ ] **Step 1: Write the failing test**

```ts
// server/lib/money.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/money.test.ts`
Expected: FAIL — `Cannot find module './money'`

- [ ] **Step 3: Write minimal implementation**

```ts
// server/lib/money.ts

/** Converts a JS number to the exact 2-decimal string Postgres numeric(10,2) expects. */
export function toMoney(amount: number): string {
  return amount.toFixed(2);
}

/** Converts a Postgres numeric-column value (returned as a string) back to a JS number. */
export function fromMoney(value: string | number): number {
  return typeof value === "number" ? value : parseFloat(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/money.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/lib/money.ts server/lib/money.test.ts
git commit -m "feat: add money conversion utility"
```

---

### Task 3: Shared schema (tables + validation) and database connection

**Files:**
- Create: `shared/schema.ts`
- Create: `server/db.ts`
- Create: `drizzle.config.ts`
- Test: `shared/schema.test.ts`

**Interfaces:**
- Produces (Drizzle tables): `authAccount`, `members`, `attributeDefinitions`, `memberAttributeValues`, `events`, `expenses`, `contributions`, `settings`.
- Produces (types): `AuthAccount`, `Member`, `AttributeDefinition`, `MemberAttributeValue`, `Event`, `Expense`, `Contribution`, `Settings`.
- Produces (zod schemas + input types): `insertMemberSchema`/`MemberInput`, `insertAttributeDefinitionSchema`/`AttributeDefinitionInput`, `insertEventSchema`/`EventInput`, `insertExpenseSchema`/`ExpenseInput`, `insertContributionSchema`/`ContributionInput`. All money/date fields in these input types are plain `number`/`YYYY-MM-DD string` — never the raw DB string-mode numeric.
- Produces: `db` (Drizzle instance) from `server/db.ts` — every storage module in later tasks imports this.
- Consumes: nothing (first schema-defining task).

- [ ] **Step 1: Create `shared/schema.ts`**

```ts
import { pgTable, serial, varchar, text, integer, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod";

// ---------- auth_account ----------
export const authAccount = pgTable("auth_account", {
  id: serial("id").primaryKey(),
  pinHash: varchar("pin_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type AuthAccount = typeof authAccount.$inferSelect;

// ---------- members ----------
export const members = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    santhaNumber: varchar("santha_number", { length: 50 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    address: text("address"),
    age: integer("age"),
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
  santhaNumber: z.string().min(1, "Santha number is required").max(50),
  phone: z.string().max(20).nullable().optional(),
  address: z.string().nullable().optional(),
  age: z.coerce.number().int().positive().max(150).nullable().optional(),
});
export type MemberInput = z.infer<typeof insertMemberSchema>;

// ---------- attribute_definitions ----------
export const ATTRIBUTE_TYPES = ["text", "number", "date"] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export const attributeDefinitions = pgTable(
  "attribute_definitions",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 60 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("text"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("attribute_definitions_key_idx").on(table.key),
  })
);
export type AttributeDefinition = typeof attributeDefinitions.$inferSelect;

export const insertAttributeDefinitionSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, "key must be lowercase letters, numbers, and underscores, starting with a letter"),
  label: z.string().min(1, "Label is required").max(100),
  type: z.enum(ATTRIBUTE_TYPES).default("text"),
});
export type AttributeDefinitionInput = z.infer<typeof insertAttributeDefinitionSchema>;

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type Event = typeof events.$inferSelect;

export const insertEventSchema = z.object({
  name: z.string().min(1, "Event name is required").max(150),
  details: z.string().nullable().optional(),
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

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

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

// ---------- settings ----------
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  openingBalance: numeric("opening_balance", { precision: 10, scale: 2 }).notNull().default("0"),
});
export type Settings = typeof settings.$inferSelect;
```

- [ ] **Step 2: Create `server/db.ts`**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import dns from "node:dns";

// Some environments have no IPv6 route at all, but Node's default DNS
// result order can hand back an IPv6 address first for hosts that publish
// both — every connection then hangs until timeout. Preferring IPv4 is a
// safe no-op anywhere IPv6 actually works.
dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool);
```

- [ ] **Step 3: Create `drizzle.config.ts`**

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

- [ ] **Step 4: Write validation tests**

```ts
// shared/schema.test.ts
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
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run shared/schema.test.ts`
Expected: PASS (all cases)

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts shared/schema.test.ts server/db.ts drizzle.config.ts
git commit -m "feat: add database schema and validation"
```

---

### Task 4: Balance calculation module

**Files:**
- Create: `server/lib/balance.ts`
- Test: `server/lib/balance.test.ts`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `computeBalance(inputs: { openingBalance: number; totalContributions: number; totalPaidExpenses: number }): number` — used by `server/storage/balance.ts` (Task 7) and `server/routes/reports.ts` (Task 13).

- [ ] **Step 1: Write the failing test**

```ts
// server/lib/balance.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/balance.test.ts`
Expected: FAIL — `Cannot find module './balance'`

- [ ] **Step 3: Write minimal implementation**

```ts
// server/lib/balance.ts

export type BalanceInputs = {
  openingBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
};

/**
 * balance = opening balance + contributions - paid expenses.
 * Pending expenses never affect this — they're surfaced separately as
 * "upcoming/owed" so the treasurer sees committed-but-unpaid costs without
 * them touching the actual cash balance.
 */
export function computeBalance({ openingBalance, totalContributions, totalPaidExpenses }: BalanceInputs): number {
  const raw = openingBalance + totalContributions - totalPaidExpenses;
  return Math.round(raw * 100) / 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/balance.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/lib/balance.ts server/lib/balance.test.ts
git commit -m "feat: add balance calculation"
```

---

### Task 5: Auth — PIN setup/login and JWT

**Files:**
- Create: `server/lib/auth.ts`
- Test: `server/lib/auth.test.ts`
- Create: `server/storage/auth.ts`
- Create: `server/middleware/requireAuth.ts`
- Create: `server/routes/auth.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `db` from `server/db.ts` (Task 3), `authAccount` table (Task 3).
- Produces: `signSessionToken`, `verifySessionToken`, `hashPin`, `verifyPin` from `server/lib/auth.ts`.
- Produces: `requireAuth` middleware from `server/middleware/requireAuth.ts` — mounted in front of every resource router from Task 6 onward. Sets `req.accountId`.
- Produces: `POST /api/auth/setup`, `POST /api/auth/login`, `GET /api/auth/status`, `PATCH /api/auth/pin`.

- [ ] **Step 1: Write the failing test for the auth lib**

```ts
// server/lib/auth.test.ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

describe("auth lib", () => {
  it("hashPin/verifyPin round-trips correctly", async () => {
    const { hashPin, verifyPin } = await import("./auth");
    const hash = await hashPin("1234");
    expect(await verifyPin("1234", hash)).toBe(true);
    expect(await verifyPin("9999", hash)).toBe(false);
  });

  it("signSessionToken/verifySessionToken round-trips correctly", async () => {
    const { signSessionToken, verifySessionToken } = await import("./auth");
    const token = signSessionToken({ accountId: 7 });
    const payload = verifySessionToken(token);
    expect(payload).toEqual({ accountId: 7 });
  });

  it("verifySessionToken returns null for garbage input", async () => {
    const { verifySessionToken } = await import("./auth");
    expect(verifySessionToken("not-a-real-token")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'`

- [ ] **Step 3: Write `server/lib/auth.ts`**

```ts
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const SESSION_EXPIRY = "365d";

export type SessionPayload = { accountId: number };

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET must be set.");
  return secret;
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: SESSION_EXPIRY });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/auth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Create `server/storage/auth.ts`**

```ts
import { db } from "../db";
import { authAccount, type AuthAccount } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function getAccount(): Promise<AuthAccount | null> {
  const [account] = await db.select().from(authAccount).limit(1);
  return account ?? null;
}

export async function createAccount(pinHash: string): Promise<AuthAccount> {
  const [account] = await db.insert(authAccount).values({ pinHash }).returning();
  return account;
}

export async function updatePin(id: number, pinHash: string): Promise<AuthAccount> {
  const [account] = await db.update(authAccount).set({ pinHash }).where(eq(authAccount.id, id)).returning();
  return account;
}
```

- [ ] **Step 6: Create `server/middleware/requireAuth.ts`**

```ts
import type { Request, Response, NextFunction } from "express";
import { verifySessionToken } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      accountId?: number;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: "Session expired or invalid" });
    return;
  }

  req.accountId = payload.accountId;
  next();
}
```

- [ ] **Step 7: Create `server/routes/auth.ts`**

```ts
import { Router } from "express";
import { z } from "zod";
import * as authStorage from "../storage/auth";
import { hashPin, verifyPin, signSessionToken } from "../lib/auth";
import { requireAuth } from "../middleware/requireAuth";
import { wrap } from "../lib/asyncHandler";

export const authRouter = Router();

const pinSchema = z.object({ pin: z.string().min(4, "PIN must be at least 4 digits").max(12) });
const changePinSchema = z.object({
  currentPin: z.string().min(1),
  newPin: z.string().min(4, "PIN must be at least 4 digits").max(12),
});

// First-ever launch: creates the single account row. Refuses if one already
// exists, since this app has exactly one treasurer account, ever.
authRouter.post(
  "/setup",
  wrap(async (req, res) => {
    const existing = await authStorage.getAccount();
    if (existing) {
      res.status(409).json({ error: "Account already set up — use /login instead" });
      return;
    }
    const { pin } = pinSchema.parse(req.body);
    const pinHash = await hashPin(pin);
    const account = await authStorage.createAccount(pinHash);
    const token = signSessionToken({ accountId: account.id });
    res.status(201).json({ token });
  })
);

authRouter.post(
  "/login",
  wrap(async (req, res) => {
    const { pin } = pinSchema.parse(req.body);
    const account = await authStorage.getAccount();
    if (!account) {
      res.status(404).json({ error: "No account set up yet — use /setup first" });
      return;
    }
    const valid = await verifyPin(pin, account.pinHash);
    if (!valid) {
      res.status(401).json({ error: "Incorrect PIN" });
      return;
    }
    const token = signSessionToken({ accountId: account.id });
    res.json({ token });
  })
);

// Lets the mobile app decide whether to show onboarding (no account yet)
// or the PIN-login screen (account exists), before any token is available.
authRouter.get(
  "/status",
  wrap(async (_req, res) => {
    const account = await authStorage.getAccount();
    res.json({ isSetUp: !!account });
  })
);

authRouter.patch(
  "/pin",
  requireAuth,
  wrap(async (req, res) => {
    const { currentPin, newPin } = changePinSchema.parse(req.body);
    const account = await authStorage.getAccount();
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const valid = await verifyPin(currentPin, account.pinHash);
    if (!valid) {
      res.status(401).json({ error: "Current PIN is incorrect" });
      return;
    }
    const pinHash = await hashPin(newPin);
    await authStorage.updatePin(account.id, pinHash);
    res.json({ ok: true });
  })
);
```

- [ ] **Step 8: Mount the auth router in `server/routes/index.ts`**

```ts
import type { Express } from "express";
import { createServer, type Server } from "http";
import { authRouter } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);

  return createServer(app);
}
```

- [ ] **Step 9: Typecheck**

Run: `npm run check`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add server/lib/auth.ts server/lib/auth.test.ts server/storage/auth.ts server/middleware/requireAuth.ts server/routes/auth.ts server/routes/index.ts
git commit -m "feat: add PIN-based auth"
```

---

### Task 6: Settings resource (opening balance)

**Files:**
- Create: `server/storage/settings.ts`
- Create: `server/routes/settings.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `db`, `settings` table (Task 3); `toMoney`/`fromMoney` (Task 2); `wrap` (Task 1); `requireAuth` (Task 5).
- Produces: `getSettings(): Promise<Settings | null>`, `setOpeningBalance(openingBalance: number): Promise<Settings>` from `server/storage/settings.ts` — `getSettings` is reused by `server/routes/reports.ts` (Task 13).
- Produces: `GET /api/settings`, `PUT /api/settings` (both behind `requireAuth`).

- [ ] **Step 1: Create `server/storage/settings.ts`**

```ts
import { db } from "../db";
import { settings, type Settings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function getSettings(): Promise<Settings | null> {
  const [row] = await db.select().from(settings).limit(1);
  return row ?? null;
}

export async function setOpeningBalance(openingBalance: number): Promise<Settings> {
  const existing = await getSettings();
  if (existing) {
    const [row] = await db
      .update(settings)
      .set({ openingBalance: toMoney(openingBalance) })
      .where(eq(settings.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db.insert(settings).values({ openingBalance: toMoney(openingBalance) }).returning();
  return row;
}
```

- [ ] **Step 2: Create `server/routes/settings.ts`**

```ts
import { Router } from "express";
import { z } from "zod";
import * as settingsStorage from "../storage/settings";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";

export const settingsRouter = Router();

const openingBalanceSchema = z.object({ openingBalance: z.coerce.number().min(0, "Opening balance cannot be negative") });

settingsRouter.get(
  "/",
  wrap(async (_req, res) => {
    const row = await settingsStorage.getSettings();
    res.json({ openingBalance: row ? fromMoney(row.openingBalance) : 0 });
  })
);

settingsRouter.put(
  "/",
  wrap(async (req, res) => {
    const { openingBalance } = openingBalanceSchema.parse(req.body);
    const row = await settingsStorage.setOpeningBalance(openingBalance);
    res.json({ openingBalance: fromMoney(row.openingBalance) });
  })
);
```

- [ ] **Step 3: Mount in `server/routes/index.ts`**

```ts
import type { Express } from "express";
import { createServer, type Server } from "http";
import { authRouter } from "./auth";
import { settingsRouter } from "./settings";
import { requireAuth } from "../middleware/requireAuth";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/settings", requireAuth, settingsRouter);

  return createServer(app);
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add server/storage/settings.ts server/routes/settings.ts server/routes/index.ts
git commit -m "feat: add settings resource (opening balance)"
```

---

### Task 7: Balance endpoint

**Files:**
- Create: `server/storage/balance.ts`
- Create: `server/routes/balance.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `db`, `contributions`, `expenses`, `settings` tables (Task 3); `fromMoney` (Task 2); `computeBalance` (Task 4); `wrap` (Task 1).
- Produces: `getBalanceInputs(): Promise<{ openingBalance: number; totalContributions: number; totalPaidExpenses: number; totalPendingExpenses: number }>` — reused by `server/routes/reports.ts` (Task 13).
- Produces: `GET /api/balance` (behind `requireAuth`).

- [ ] **Step 1: Create `server/storage/balance.ts`**

```ts
import { db } from "../db";
import { contributions, expenses, settings } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { fromMoney } from "../lib/money";

export type BalanceInputs = {
  openingBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
};

export async function getBalanceInputs(): Promise<BalanceInputs> {
  const [settingsRow] = await db.select().from(settings).limit(1);
  const openingBalance = settingsRow ? fromMoney(settingsRow.openingBalance) : 0;

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

  return { openingBalance, totalContributions, totalPaidExpenses, totalPendingExpenses };
}
```

- [ ] **Step 2: Create `server/routes/balance.ts`**

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
    const balance = computeBalance(inputs);
    res.json({ ...inputs, balance });
  })
);
```

- [ ] **Step 3: Mount in `server/routes/index.ts`**

Add the import and line `app.use("/api/balance", requireAuth, balanceRouter);` alongside the existing settings mount.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add server/storage/balance.ts server/routes/balance.ts server/routes/index.ts
git commit -m "feat: add balance endpoint"
```

---

### Task 8: Members resource (with custom attribute values)

**Files:**
- Create: `server/storage/members.ts`
- Create: `server/routes/members.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `db`, `members`, `memberAttributeValues` tables and `insertMemberSchema`/`MemberInput` (Task 3); `wrap` (Task 1).
- Produces: `listMembers`, `getMember`, `createMember`, `updateMember`, `deleteMember`, `setMemberAttributeValue` from `server/storage/members.ts`.
- Produces: `GET /api/members`, `GET /api/members/:id`, `POST /api/members`, `PATCH /api/members/:id`, `DELETE /api/members/:id`, `PUT /api/members/:id/attributes/:key` (all behind `requireAuth`).

- [ ] **Step 1: Create `server/storage/members.ts`**

```ts
import { db } from "../db";
import { members, memberAttributeValues, type Member, type MemberInput } from "@shared/schema";
import { eq, ilike, or, and } from "drizzle-orm";

export async function listMembers(search?: string): Promise<Member[]> {
  if (search) {
    return db
      .select()
      .from(members)
      .where(or(ilike(members.name, `%${search}%`), ilike(members.santhaNumber, `%${search}%`)));
  }
  return db.select().from(members);
}

export async function getMember(id: number) {
  const [member] = await db.select().from(members).where(eq(members.id, id));
  if (!member) return null;
  const attributes = await db
    .select()
    .from(memberAttributeValues)
    .where(eq(memberAttributeValues.memberId, id));
  return { ...member, attributes };
}

export async function createMember(data: MemberInput): Promise<Member> {
  const [member] = await db.insert(members).values(data).returning();
  return member;
}

export async function updateMember(id: number, data: Partial<MemberInput>): Promise<Member | null> {
  const [member] = await db
    .update(members)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(members.id, id))
    .returning();
  return member ?? null;
}

export async function deleteMember(id: number): Promise<boolean> {
  const result = await db.delete(members).where(eq(members.id, id)).returning({ id: members.id });
  return result.length > 0;
}

export async function setMemberAttributeValue(memberId: number, attributeKey: string, value: string) {
  const [existing] = await db
    .select()
    .from(memberAttributeValues)
    .where(and(eq(memberAttributeValues.memberId, memberId), eq(memberAttributeValues.attributeKey, attributeKey)));
  if (existing) {
    const [updated] = await db
      .update(memberAttributeValues)
      .set({ value })
      .where(eq(memberAttributeValues.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(memberAttributeValues)
    .values({ memberId, attributeKey, value })
    .returning();
  return created;
}
```

- [ ] **Step 2: Create `server/routes/members.ts`**

```ts
import { Router } from "express";
import { z } from "zod";
import { insertMemberSchema } from "@shared/schema";
import * as membersStorage from "../storage/members";
import { wrap } from "../lib/asyncHandler";

export const membersRouter = Router();

membersRouter.get(
  "/",
  wrap(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const list = await membersStorage.listMembers(search);
    res.json(list);
  })
);

membersRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const member = await membersStorage.getMember(Number(req.params.id));
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    res.json(member);
  })
);

membersRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertMemberSchema.parse(req.body);
    try {
      const member = await membersStorage.createMember(data);
      res.status(201).json(member);
    } catch (error: any) {
      if (error.code === "23505") {
        res.status(409).json({ error: "That santha number is already in use" });
        return;
      }
      throw error;
    }
  })
);

membersRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const data = insertMemberSchema.partial().parse(req.body);
    try {
      const member = await membersStorage.updateMember(Number(req.params.id), data);
      if (!member) {
        res.status(404).json({ error: "Member not found" });
        return;
      }
      res.json(member);
    } catch (error: any) {
      if (error.code === "23505") {
        res.status(409).json({ error: "That santha number is already in use" });
        return;
      }
      throw error;
    }
  })
);

membersRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const deleted = await membersStorage.deleteMember(Number(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    res.status(204).send();
  })
);

const attributeValueSchema = z.object({ value: z.string() });

membersRouter.put(
  "/:id/attributes/:key",
  wrap(async (req, res) => {
    const { value } = attributeValueSchema.parse(req.body);
    const result = await membersStorage.setMemberAttributeValue(Number(req.params.id), req.params.key, value);
    res.json(result);
  })
);
```

- [ ] **Step 3: Mount in `server/routes/index.ts`**

Add the import and `app.use("/api/members", requireAuth, membersRouter);`.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add server/storage/members.ts server/routes/members.ts server/routes/index.ts
git commit -m "feat: add members resource"
```

---

### Task 9: Attribute definitions resource (config screen backend)

**Files:**
- Create: `server/storage/attributes.ts`
- Create: `server/routes/attributes.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `db`, `attributeDefinitions` table and `insertAttributeDefinitionSchema` (Task 3); `wrap` (Task 1).
- Produces: `listAttributeDefinitions`, `createAttributeDefinition`, `deleteAttributeDefinition` from `server/storage/attributes.ts`.
- Produces: `GET /api/attributes`, `POST /api/attributes`, `DELETE /api/attributes/:id` (behind `requireAuth`). The mobile Members screen (mobile plan) reads this list to render custom fields dynamically.

- [ ] **Step 1: Create `server/storage/attributes.ts`**

```ts
import { db } from "../db";
import { attributeDefinitions, type AttributeDefinition, type AttributeDefinitionInput } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function listAttributeDefinitions(): Promise<AttributeDefinition[]> {
  return db.select().from(attributeDefinitions);
}

export async function createAttributeDefinition(data: AttributeDefinitionInput): Promise<AttributeDefinition> {
  const [attr] = await db.insert(attributeDefinitions).values(data).returning();
  return attr;
}

export async function deleteAttributeDefinition(id: number): Promise<boolean> {
  const result = await db
    .delete(attributeDefinitions)
    .where(eq(attributeDefinitions.id, id))
    .returning({ id: attributeDefinitions.id });
  return result.length > 0;
}
```

- [ ] **Step 2: Create `server/routes/attributes.ts`**

```ts
import { Router } from "express";
import { insertAttributeDefinitionSchema } from "@shared/schema";
import * as attributesStorage from "../storage/attributes";
import { wrap } from "../lib/asyncHandler";

export const attributesRouter = Router();

attributesRouter.get(
  "/",
  wrap(async (_req, res) => {
    const list = await attributesStorage.listAttributeDefinitions();
    res.json(list);
  })
);

attributesRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertAttributeDefinitionSchema.parse(req.body);
    try {
      const attr = await attributesStorage.createAttributeDefinition(data);
      res.status(201).json(attr);
    } catch (error: any) {
      if (error.code === "23505") {
        res.status(409).json({ error: "An attribute with that key already exists" });
        return;
      }
      throw error;
    }
  })
);

attributesRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const deleted = await attributesStorage.deleteAttributeDefinition(Number(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: "Attribute not found" });
      return;
    }
    res.status(204).send();
  })
);
```

- [ ] **Step 3: Mount in `server/routes/index.ts`**

Add the import and `app.use("/api/attributes", requireAuth, attributesRouter);`.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add server/storage/attributes.ts server/routes/attributes.ts server/routes/index.ts
git commit -m "feat: add attribute definitions resource"
```

---

### Task 10: Events resource

**Files:**
- Create: `server/storage/events.ts`
- Create: `server/routes/events.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `db`, `events`, `expenses` tables and `insertEventSchema` (Task 3); `fromMoney` (Task 2); `wrap` (Task 1).
- Produces: `listEvents` (each row includes `totalPaid: number`), `getEvent`, `createEvent`, `updateEvent`, `deleteEvent` from `server/storage/events.ts`.
- Produces: `GET /api/events`, `GET /api/events/:id`, `POST /api/events`, `PATCH /api/events/:id`, `DELETE /api/events/:id` (behind `requireAuth`).

- [ ] **Step 1: Create `server/storage/events.ts`**

```ts
import { db } from "../db";
import { events, expenses, type Event, type EventInput } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { fromMoney } from "../lib/money";

export async function listEvents() {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      details: events.details,
      createdAt: events.createdAt,
      totalPaid: sql<string>`coalesce(sum(${expenses.amount}) filter (where ${expenses.status} = 'paid'), 0)`,
    })
    .from(events)
    .leftJoin(expenses, eq(expenses.eventId, events.id))
    .groupBy(events.id);
  return rows.map((row) => ({ ...row, totalPaid: fromMoney(row.totalPaid) }));
}

export async function getEvent(id: number): Promise<Event | null> {
  const [event] = await db.select().from(events).where(eq(events.id, id));
  return event ?? null;
}

export async function createEvent(data: EventInput): Promise<Event> {
  const [event] = await db.insert(events).values(data).returning();
  return event;
}

export async function updateEvent(id: number, data: Partial<EventInput>): Promise<Event | null> {
  const [event] = await db.update(events).set(data).where(eq(events.id, id)).returning();
  return event ?? null;
}

export async function deleteEvent(id: number): Promise<boolean> {
  const result = await db.delete(events).where(eq(events.id, id)).returning({ id: events.id });
  return result.length > 0;
}
```

- [ ] **Step 2: Create `server/routes/events.ts`**

```ts
import { Router } from "express";
import { insertEventSchema } from "@shared/schema";
import * as eventsStorage from "../storage/events";
import { wrap } from "../lib/asyncHandler";

export const eventsRouter = Router();

eventsRouter.get(
  "/",
  wrap(async (_req, res) => {
    const list = await eventsStorage.listEvents();
    res.json(list);
  })
);

eventsRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const event = await eventsStorage.getEvent(Number(req.params.id));
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(event);
  })
);

eventsRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertEventSchema.parse(req.body);
    const event = await eventsStorage.createEvent(data);
    res.status(201).json(event);
  })
);

eventsRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const data = insertEventSchema.partial().parse(req.body);
    const event = await eventsStorage.updateEvent(Number(req.params.id), data);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(event);
  })
);

eventsRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const deleted = await eventsStorage.deleteEvent(Number(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.status(204).send();
  })
);
```

- [ ] **Step 3: Mount in `server/routes/index.ts`**

Add the import and `app.use("/api/events", requireAuth, eventsRouter);`.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add server/storage/events.ts server/routes/events.ts server/routes/index.ts
git commit -m "feat: add events resource"
```

---

### Task 11: Expenses resource with receipt photo upload

**Files:**
- Create: `server/lib/cloudinary.ts`
- Create: `server/routes/upload.ts`
- Create: `server/storage/expenses.ts`
- Create: `server/routes/expenses.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `db`, `expenses` table and `insertExpenseSchema`/`ExpenseInput` (Task 3); `toMoney` (Task 2); `wrap` (Task 1).
- Produces: `uploadImageBuffer(buffer: Buffer, folder: string): Promise<{ secureUrl: string }>` from `server/lib/cloudinary.ts`.
- Produces: `POST /api/upload/receipt` returning `{ url: string }` — the mobile expense form (mobile plan) calls this before submitting an expense with `receiptPhotoUrl`.
- Produces: `listExpenses`, `getExpense`, `createExpense`, `updateExpense`, `deleteExpense` from `server/storage/expenses.ts`.
- Produces: `GET /api/expenses` (optional `?eventId=<id>` or `?eventId=general`), `GET /api/expenses/:id`, `POST /api/expenses`, `PATCH /api/expenses/:id`, `DELETE /api/expenses/:id` (behind `requireAuth`).

- [ ] **Step 1: Create `server/lib/cloudinary.ts`**

```ts
import { v2 as cloudinary } from "cloudinary";

const isCloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.warn(
    "Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET). Receipt photo uploads will fail until these are set."
  );
}

export function uploadImageBuffer(buffer: Buffer, folder: string): Promise<{ secureUrl: string }> {
  if (!isCloudinaryConfigured) {
    return Promise.reject(new Error("Image uploads are not configured yet."));
  }
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        transformation: [{ width: 1600, height: 1600, crop: "limit" }, { quality: "auto:good" }, { fetch_format: "auto" }],
      },
      (error, result) => {
        if (error) reject(error);
        else if (result) resolve({ secureUrl: result.secure_url });
        else reject(new Error("Upload failed"));
      }
    );
    uploadStream.end(buffer);
  });
}
```

- [ ] **Step 2: Create `server/routes/upload.ts`**

```ts
import { Router } from "express";
import multer from "multer";
import path from "path";
import { uploadImageBuffer } from "../lib/cloudinary";

export const uploadRouter = Router();

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowedTypes.test(file.mimetype);
    if (extOk && mimeOk) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image files (jpeg, png, webp) are allowed"));
  },
}).single("image");

uploadRouter.post("/receipt", (req, res) => {
  uploadImage(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No image file uploaded" });
      return;
    }
    try {
      const { secureUrl } = await uploadImageBuffer(req.file.buffer, "csi-wf/receipts");
      res.json({ url: secureUrl });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Upload failed" });
    }
  });
});
```

- [ ] **Step 3: Create `server/storage/expenses.ts`**

```ts
import { db } from "../db";
import { expenses, type Expense, type ExpenseInput } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function listExpenses(eventId?: number | null): Promise<Expense[]> {
  if (eventId === undefined) return db.select().from(expenses);
  if (eventId === null) return db.select().from(expenses).where(isNull(expenses.eventId));
  return db.select().from(expenses).where(eq(expenses.eventId, eventId));
}

export async function getExpense(id: number): Promise<Expense | null> {
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, id));
  return expense ?? null;
}

export async function createExpense(data: ExpenseInput): Promise<Expense> {
  const [expense] = await db
    .insert(expenses)
    .values({ ...data, amount: toMoney(data.amount) })
    .returning();
  return expense;
}

export async function updateExpense(id: number, data: Partial<ExpenseInput>): Promise<Expense | null> {
  const { amount, ...rest } = data;
  const [expense] = await db
    .update(expenses)
    .set({ ...rest, ...(amount !== undefined ? { amount: toMoney(amount) } : {}) })
    .where(eq(expenses.id, id))
    .returning();
  return expense ?? null;
}

export async function deleteExpense(id: number): Promise<boolean> {
  const result = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
  return result.length > 0;
}
```

- [ ] **Step 4: Create `server/routes/expenses.ts`**

```ts
import { Router } from "express";
import { insertExpenseSchema, type Expense } from "@shared/schema";
import * as expensesStorage from "../storage/expenses";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";

export const expensesRouter = Router();

// Storage returns the raw Drizzle row, where `amount` is the numeric
// column's string form. Every response is serialized through here so API
// consumers always see a plain number, matching every other resource.
function serializeExpense(expense: Expense) {
  return { ...expense, amount: fromMoney(expense.amount) };
}

expensesRouter.get(
  "/",
  wrap(async (req, res) => {
    const raw = req.query.eventId;
    let eventId: number | null | undefined;
    if (raw === "general") eventId = null;
    else if (typeof raw === "string") eventId = Number(raw);
    const list = await expensesStorage.listExpenses(eventId);
    res.json(list.map(serializeExpense));
  })
);

expensesRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const expense = await expensesStorage.getExpense(Number(req.params.id));
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    res.json(serializeExpense(expense));
  })
);

expensesRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertExpenseSchema.parse(req.body);
    const expense = await expensesStorage.createExpense(data);
    res.status(201).json(serializeExpense(expense));
  })
);

expensesRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const data = insertExpenseSchema.partial().parse(req.body);
    const expense = await expensesStorage.updateExpense(Number(req.params.id), data);
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    res.json(serializeExpense(expense));
  })
);

expensesRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const deleted = await expensesStorage.deleteExpense(Number(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    res.status(204).send();
  })
);
```

- [ ] **Step 5: Mount in `server/routes/index.ts`**

Add the imports and `app.use("/api/expenses", requireAuth, expensesRouter);` and `app.use("/api/upload", requireAuth, uploadRouter);`.

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add server/lib/cloudinary.ts server/routes/upload.ts server/storage/expenses.ts server/routes/expenses.ts server/routes/index.ts
git commit -m "feat: add expenses resource with receipt upload"
```

---

### Task 12: Contributions resource

**Files:**
- Create: `server/storage/contributions.ts`
- Create: `server/routes/contributions.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `db`, `contributions` table and `insertContributionSchema`/`ContributionInput` (Task 3); `toMoney` (Task 2); `wrap` (Task 1).
- Produces: `listContributions`, `createContribution`, `updateContribution`, `deleteContribution` from `server/storage/contributions.ts`.
- Produces: `GET /api/contributions` (optional `?memberId=<id>`), `POST /api/contributions`, `PATCH /api/contributions/:id`, `DELETE /api/contributions/:id` (behind `requireAuth`).

- [ ] **Step 1: Create `server/storage/contributions.ts`**

```ts
import { db } from "../db";
import { contributions, type Contribution, type ContributionInput } from "@shared/schema";
import { eq } from "drizzle-orm";
import { toMoney } from "../lib/money";

export async function listContributions(memberId?: number): Promise<Contribution[]> {
  if (memberId !== undefined) {
    return db.select().from(contributions).where(eq(contributions.memberId, memberId));
  }
  return db.select().from(contributions);
}

export async function createContribution(data: ContributionInput): Promise<Contribution> {
  const [contribution] = await db
    .insert(contributions)
    .values({ ...data, amount: toMoney(data.amount) })
    .returning();
  return contribution;
}

export async function updateContribution(id: number, data: Partial<ContributionInput>): Promise<Contribution | null> {
  const { amount, ...rest } = data;
  const [contribution] = await db
    .update(contributions)
    .set({ ...rest, ...(amount !== undefined ? { amount: toMoney(amount) } : {}) })
    .where(eq(contributions.id, id))
    .returning();
  return contribution ?? null;
}

export async function deleteContribution(id: number): Promise<boolean> {
  const result = await db.delete(contributions).where(eq(contributions.id, id)).returning({ id: contributions.id });
  return result.length > 0;
}
```

- [ ] **Step 2: Create `server/routes/contributions.ts`**

```ts
import { Router } from "express";
import { insertContributionSchema, type Contribution } from "@shared/schema";
import * as contributionsStorage from "../storage/contributions";
import { wrap } from "../lib/asyncHandler";
import { fromMoney } from "../lib/money";

export const contributionsRouter = Router();

// Same reasoning as expenses.ts: storage returns the raw numeric-column
// string, this serializes it to a plain number for every API consumer.
function serializeContribution(contribution: Contribution) {
  return { ...contribution, amount: fromMoney(contribution.amount) };
}

contributionsRouter.get(
  "/",
  wrap(async (req, res) => {
    const memberId = typeof req.query.memberId === "string" ? Number(req.query.memberId) : undefined;
    const list = await contributionsStorage.listContributions(memberId);
    res.json(list.map(serializeContribution));
  })
);

contributionsRouter.post(
  "/",
  wrap(async (req, res) => {
    const data = insertContributionSchema.parse(req.body);
    const contribution = await contributionsStorage.createContribution(data);
    res.status(201).json(serializeContribution(contribution));
  })
);

contributionsRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const data = insertContributionSchema.partial().parse(req.body);
    const contribution = await contributionsStorage.updateContribution(Number(req.params.id), data);
    if (!contribution) {
      res.status(404).json({ error: "Contribution not found" });
      return;
    }
    res.json(serializeContribution(contribution));
  })
);

contributionsRouter.delete(
  "/:id",
  wrap(async (req, res) => {
    const deleted = await contributionsStorage.deleteContribution(Number(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: "Contribution not found" });
      return;
    }
    res.status(204).send();
  })
);
```

- [ ] **Step 3: Mount in `server/routes/index.ts`**

Add the import and `app.use("/api/contributions", requireAuth, contributionsRouter);`.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add server/storage/contributions.ts server/routes/contributions.ts server/routes/index.ts
git commit -m "feat: add contributions resource"
```

---

### Task 13: Reports resource with PDF export

**Files:**
- Create: `server/storage/reports.ts`
- Create: `server/lib/pdf.ts`
- Create: `server/routes/reports.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Consumes: `db`, `contributions`, `expenses`, `events`, `members` tables (Task 3); `fromMoney` (Task 2); `computeBalance` (Task 4); `getSettings` (Task 6); `wrap` (Task 1).
- Produces: `getReportTotals`, `getExpensesByEvent`, `getContributionsInRange` from `server/storage/reports.ts`.
- Produces: `generateReportPdf(data: ReportPdfData): Promise<Buffer>` from `server/lib/pdf.ts`.
- Produces: `GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` (JSON), `GET /api/reports/pdf?from=&to=` (PDF download) (behind `requireAuth`).

- [ ] **Step 1: Create `server/storage/reports.ts`**

```ts
import { db } from "../db";
import { contributions, expenses, events } from "@shared/schema";
import { sql, and, gte, lte, eq } from "drizzle-orm";

export type ReportRange = { from: string; to: string };

export async function getReportTotals({ from, to }: ReportRange) {
  const [contribRow] = await db
    .select({ total: sql<string>`coalesce(sum(${contributions.amount}), 0)` })
    .from(contributions)
    .where(and(gte(contributions.date, from), lte(contributions.date, to)));

  const [paidRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(gte(expenses.date, from), lte(expenses.date, to), eq(expenses.status, "paid")));

  const [pendingRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(gte(expenses.date, from), lte(expenses.date, to), eq(expenses.status, "pending")));

  return {
    totalContributions: contribRow.total,
    totalPaidExpenses: paidRow.total,
    totalPendingExpenses: pendingRow.total,
  };
}

export async function getExpensesByEvent({ from, to }: ReportRange) {
  return db
    .select({
      eventName: events.name,
      description: expenses.description,
      amount: expenses.amount,
      status: expenses.status,
      date: expenses.date,
    })
    .from(expenses)
    .leftJoin(events, eq(expenses.eventId, events.id))
    .where(and(gte(expenses.date, from), lte(expenses.date, to)));
}

export async function getContributionsInRange({ from, to }: ReportRange) {
  return db.select().from(contributions).where(and(gte(contributions.date, from), lte(contributions.date, to)));
}
```

- [ ] **Step 2: Create `server/lib/pdf.ts`**

```ts
import PDFDocument from "pdfkit";
import { fromMoney } from "./money";

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
};

export function generateReportPdf(data: ReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("CSI Women's Fellowship - Treasurer Report", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Period: ${data.from} to ${data.to}`, { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(13).text("Summary");
    doc.fontSize(11);
    doc.text(`Opening balance: Rs. ${data.openingBalance.toFixed(2)}`);
    doc.text(`Contributions received: Rs. ${data.totalContributions.toFixed(2)}`);
    doc.text(`Expenses paid: Rs. ${data.totalPaidExpenses.toFixed(2)}`);
    doc.text(`Expenses pending: Rs. ${data.totalPendingExpenses.toFixed(2)}`);
    doc.font("Helvetica-Bold").text(`Closing balance: Rs. ${data.closingBalance.toFixed(2)}`);
    doc.font("Helvetica");
    doc.moveDown(1.5);

    doc.fontSize(13).text("Contributions");
    doc.fontSize(10);
    if (data.contributions.length === 0) doc.text("None in this period.");
    for (const c of data.contributions) {
      doc.text(`${c.date}  ${c.memberName}  Rs. ${fromMoney(c.amount).toFixed(2)}${c.note ? `  (${c.note})` : ""}`);
    }
    doc.moveDown(1.5);

    doc.fontSize(13).text("Expenses");
    doc.fontSize(10);
    if (data.expenses.length === 0) doc.text("None in this period.");
    for (const e of data.expenses) {
      doc.text(
        `${e.date}  [${e.eventName ?? "General"}]  ${e.description}  Rs. ${fromMoney(e.amount).toFixed(2)}  (${e.status})`
      );
    }

    doc.end();
  });
}
```

- [ ] **Step 3: Create `server/routes/reports.ts`**

```ts
import { Router } from "express";
import { z } from "zod";
import { wrap } from "../lib/asyncHandler";
import * as reportsStorage from "../storage/reports";
import { getSettings } from "../storage/settings";
import { fromMoney } from "../lib/money";
import { computeBalance } from "../lib/balance";
import { generateReportPdf } from "../lib/pdf";
import { db } from "../db";
import { members } from "@shared/schema";

export const reportsRouter = Router();

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
});

async function buildReport(from: string, to: string) {
  const totals = await reportsStorage.getReportTotals({ from, to });
  const settingsRow = await getSettings();
  const openingBalance = settingsRow ? fromMoney(settingsRow.openingBalance) : 0;
  const totalContributions = fromMoney(totals.totalContributions);
  const totalPaidExpenses = fromMoney(totals.totalPaidExpenses);
  const totalPendingExpenses = fromMoney(totals.totalPendingExpenses);
  const closingBalance = computeBalance({ openingBalance, totalContributions, totalPaidExpenses });

  const expenseRows = await reportsStorage.getExpensesByEvent({ from, to });
  const contributionRows = await reportsStorage.getContributionsInRange({ from, to });

  const memberRows = await db.select({ id: members.id, name: members.name }).from(members);
  const memberNameById = new Map(memberRows.map((m) => [m.id, m.name]));

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
  };
}

reportsRouter.get(
  "/",
  wrap(async (req, res) => {
    const { from, to } = rangeSchema.parse(req.query);
    const report = await buildReport(from, to);
    // buildReport's expenses/contributions arrays keep amount as the raw
    // numeric-column string (that's what generateReportPdf below expects) —
    // convert to plain numbers here so this JSON response matches every
    // other endpoint's contract.
    res.json({
      ...report,
      expenses: report.expenses.map((e) => ({ ...e, amount: fromMoney(e.amount) })),
      contributions: report.contributions.map((c) => ({ ...c, amount: fromMoney(c.amount) })),
    });
  })
);

reportsRouter.get(
  "/pdf",
  wrap(async (req, res) => {
    const { from, to } = rangeSchema.parse(req.query);
    const report = await buildReport(from, to);
    const pdfBuffer = await generateReportPdf(report);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="csi-wf-report-${from}-to-${to}.pdf"`);
    res.send(pdfBuffer);
  })
);
```

- [ ] **Step 4: Mount in `server/routes/index.ts`**

Add the import and `app.use("/api/reports", requireAuth, reportsRouter);`. At this point `server/routes/index.ts` should mount all ten routers (auth, settings, balance, members, attributes, events, expenses, upload, contributions, reports) plus the health check.

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add server/storage/reports.ts server/lib/pdf.ts server/routes/reports.ts server/routes/index.ts
git commit -m "feat: add reports resource with PDF export"
```

---

### Task 14: End-to-end smoke test against a live database

**Files:** none (verification only)

This task requires a real Postgres database and Cloudinary credentials — it is a manual verification step for whoever runs the plan with real secrets in `.env`, not something an automated executor without provisioned infrastructure can complete on its own. If secrets are unavailable, note that explicitly and stop here; Tasks 1-13 are already independently verified via `npm run check` and the vitest suite.

**Interfaces:**
- Consumes: every route mounted in Task 5-13.

- [ ] **Step 1: Provision and push the schema**

Set `DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `.env` (copy from `.env.example`). Then:

```bash
npm run db:push
npm run dev &
sleep 2
```

- [ ] **Step 2: Run the full lifecycle via curl**

```bash
BASE=http://localhost:5000

# Onboarding: set up the single account
TOKEN=$(curl -s -X POST $BASE/api/auth/setup -H "Content-Type: application/json" -d '{"pin":"1234"}' | jq -r .token)

# Set opening balance
curl -s -X PUT $BASE/api/settings -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"openingBalance": 5000}'

# Create a member
MEMBER_ID=$(curl -s -X POST $BASE/api/members -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Grace Devi","santhaNumber":"SW-101","phone":"9876543210","age":54}' | jq -r .id)

# Create an event
EVENT_ID=$(curl -s -X POST $BASE/api/events -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Annual Meet","details":"2026 annual gathering"}' | jq -r .id)

# Add a paid expense under the event
curl -s -X POST $BASE/api/expenses -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"eventId\":$EVENT_ID,\"description\":\"Hall rent\",\"amount\":1200,\"status\":\"paid\",\"date\":\"2026-08-29\"}"

# Add a general (non-event) pending expense
curl -s -X POST $BASE/api/expenses -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"description":"Stationery","amount":150,"status":"pending","date":"2026-08-29"}'

# Add a contribution
curl -s -X POST $BASE/api/contributions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"memberId\":$MEMBER_ID,\"amount\":500,\"date\":\"2026-08-29\"}"

# Check balance
curl -s $BASE/api/balance -H "Authorization: Bearer $TOKEN"

# Check report
curl -s "$BASE/api/reports?from=2026-08-01&to=2026-08-31" -H "Authorization: Bearer $TOKEN"

# Download PDF
curl -s "$BASE/api/reports/pdf?from=2026-08-01&to=2026-08-31" -H "Authorization: Bearer $TOKEN" -o report.pdf
file report.pdf
```

Expected: every request returns a 2xx status; `GET /api/balance` returns `{"balance": 5300, ...}` (5000 opening + 500 contribution − 1200 paid expense; the 150 pending expense is excluded); `report.pdf` is identified as a valid PDF document.

- [ ] **Step 3: Stop the server**

```bash
kill %1
```

- [ ] **Step 4: Run the full unit test suite one more time**

```bash
npm run test
```

Expected: all tests across `money.test.ts`, `schema.test.ts`, `balance.test.ts`, `auth.test.ts` pass.

No commit needed for this task (verification only).

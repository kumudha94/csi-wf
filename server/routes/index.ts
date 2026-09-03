import type { Express } from "express";
import { createServer, type Server } from "http";
import { authRouter } from "./auth";
import { settingsRouter } from "./settings";
import { balanceRouter } from "./balance";
import { membersRouter } from "./members";
import { attributesRouter } from "./attributes";
import { eventsRouter } from "./events";
import { expensesRouter } from "./expenses";
import { uploadRouter } from "./upload";
import { contributionsRouter } from "./contributions";
import { cashFundIncomeRouter } from "./cashFundIncome";
import { reportsRouter } from "./reports";
import { requireAuth } from "../middleware/requireAuth";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/settings", requireAuth, settingsRouter);
  app.use("/api/balance", requireAuth, balanceRouter);
  app.use("/api/members", requireAuth, membersRouter);
  app.use("/api/attributes", requireAuth, attributesRouter);
  app.use("/api/events", requireAuth, eventsRouter);
  app.use("/api/expenses", requireAuth, expensesRouter);
  app.use("/api/upload", requireAuth, uploadRouter);
  app.use("/api/contributions", requireAuth, contributionsRouter);
  app.use("/api/cash-fund-income", requireAuth, cashFundIncomeRouter);
  app.use("/api/reports", requireAuth, reportsRouter);

  return createServer(app);
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import { authRouter } from "./auth";
import { settingsRouter } from "./settings";
import { balanceRouter } from "./balance";
import { membersRouter } from "./members";
import { requireAuth } from "../middleware/requireAuth";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/settings", requireAuth, settingsRouter);
  app.use("/api/balance", requireAuth, balanceRouter);
  app.use("/api/members", requireAuth, membersRouter);

  return createServer(app);
}

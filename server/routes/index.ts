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

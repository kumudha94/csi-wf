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

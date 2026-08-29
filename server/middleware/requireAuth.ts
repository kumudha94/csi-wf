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

import { Router } from "express";
import { wrap } from "../lib/asyncHandler";
import { getDashboardSummary } from "../storage/dashboard";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/",
  wrap(async (_req, res) => {
    const summary = await getDashboardSummary();
    res.json(summary);
  })
);

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

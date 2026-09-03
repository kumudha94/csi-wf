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

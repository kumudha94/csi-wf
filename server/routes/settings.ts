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

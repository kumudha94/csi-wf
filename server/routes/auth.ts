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

// Brute-force guard for /login. This app has exactly one account, runs as a
// single process, and is not worth a DB table or a new dependency for — so the
// counter lives in memory under one fixed key and resets on restart.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;
const LOGIN_KEY = "account";
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

/** True while the account is locked out; clears an expired lockout as it goes. */
function isLockedOut(): boolean {
  const entry = loginAttempts.get(LOGIN_KEY);
  if (!entry) return false;
  if (entry.lockedUntil > Date.now()) return true;
  // Lockout has expired — wipe the record so the next attempt starts fresh
  // with a full allowance rather than re-locking on a single failure.
  if (entry.lockedUntil > 0) loginAttempts.delete(LOGIN_KEY);
  return false;
}

function recordFailedLogin(): void {
  const entry = loginAttempts.get(LOGIN_KEY) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  loginAttempts.set(LOGIN_KEY, entry);
}

function clearFailedLogins(): void {
  loginAttempts.delete(LOGIN_KEY);
}

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
    if (isLockedOut()) {
      res.status(429).json({ error: "Too many failed attempts, try again in a minute" });
      return;
    }
    const { pin } = pinSchema.parse(req.body);
    const account = await authStorage.getAccount();
    if (!account) {
      res.status(404).json({ error: "No account set up yet — use /setup first" });
      return;
    }
    const valid = await verifyPin(pin, account.pinHash);
    if (!valid) {
      recordFailedLogin();
      res.status(401).json({ error: "Incorrect PIN" });
      return;
    }
    clearFailedLogins();
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

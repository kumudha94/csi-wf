import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const SESSION_EXPIRY = "365d";

export type SessionPayload = { accountId: number };

// Fail fast at import time, the same way server/db.ts does for DATABASE_URL.
// Checking this lazily meant a deploy with no JWT_SECRET booted green and only
// broke later, on the first login attempt.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set.");
}

const JWT_SECRET: string = process.env.JWT_SECRET;

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_EXPIRY });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string" || typeof decoded.accountId !== "number") {
      return null;
    }
    // jwt.verify returns iat/exp alongside our payload; strip them so the
    // return value actually matches the declared SessionPayload shape.
    return { accountId: decoded.accountId };
  } catch {
    return null;
  }
}

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

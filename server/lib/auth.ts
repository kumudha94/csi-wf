import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const SESSION_EXPIRY = "365d";

export type SessionPayload = { accountId: number };

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET must be set.");
  return secret;
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: SESSION_EXPIRY });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
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

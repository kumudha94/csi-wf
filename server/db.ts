import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import dns from "node:dns";

// Some environments have no IPv6 route at all, but Node's default DNS
// result order can hand back an IPv6 address first for hosts that publish
// both — every connection then hangs until timeout. Preferring IPv4 is a
// safe no-op anywhere IPv6 actually works.
dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool);

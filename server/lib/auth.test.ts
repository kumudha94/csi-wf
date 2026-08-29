import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

describe("auth lib", () => {
  it("hashPin/verifyPin round-trips correctly", async () => {
    const { hashPin, verifyPin } = await import("./auth");
    const hash = await hashPin("1234");
    expect(await verifyPin("1234", hash)).toBe(true);
    expect(await verifyPin("9999", hash)).toBe(false);
  });

  it("signSessionToken/verifySessionToken round-trips correctly", async () => {
    const { signSessionToken, verifySessionToken } = await import("./auth");
    const token = signSessionToken({ accountId: 7 });
    const payload = verifySessionToken(token);
    expect(payload).toEqual({ accountId: 7 });
  });

  it("verifySessionToken returns null for garbage input", async () => {
    const { verifySessionToken } = await import("./auth");
    expect(verifySessionToken("not-a-real-token")).toBeNull();
  });
});

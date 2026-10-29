import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { SESSION_TTL_MS, signSession, verifySession } from "./session";

const secret = "session-secret";
const session = { streamerId: "s1", twitchUserId: "tw1" };

describe("session signing", () => {
  it("round-trips a signed session", () => {
    const token = signSession(session, secret);
    expect(verifySession(token, secret)).toEqual(
      expect.objectContaining(session),
    );
  });
  it("stamps an expiry when signing", () => {
    const now = 1_700_000_000_000;
    const token = signSession(session, secret, now);
    const verified = verifySession(token, secret, now);
    expect(verified?.exp).toBeGreaterThan(now);
  });
  it("rejects an expired session", () => {
    const issuedAt = 1_700_000_000_000;
    const token = signSession(session, secret, issuedAt);
    expect(
      verifySession(token, secret, issuedAt + SESSION_TTL_MS + 1000),
    ).toBeNull();
  });
  it("rejects a session without an expiry claim", () => {
    const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");
    expect(verifySession(`${payload}.${signature}`, secret)).toBeNull();
  });
  it("rejects a tampered payload", () => {
    const token = signSession(session, secret);
    const [, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ streamerId: "s2", twitchUserId: "tw2", exp: 9e15 }),
    ).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, secret)).toBeNull();
  });
  it("rejects a token signed with another secret", () => {
    expect(verifySession(signSession(session, secret), "other")).toBeNull();
  });
});

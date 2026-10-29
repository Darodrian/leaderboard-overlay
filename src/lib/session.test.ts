import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "./session";

const secret = "session-secret";
const session = { streamerId: "s1", twitchUserId: "tw1" };

describe("session signing", () => {
  it("round-trips a signed session", () => {
    const token = signSession(session, secret);
    expect(verifySession(token, secret)).toEqual(session);
  });
  it("rejects a tampered payload", () => {
    const token = signSession(session, secret);
    const [, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ streamerId: "s2", twitchUserId: "tw2" }),
    ).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, secret)).toBeNull();
  });
  it("rejects a token signed with another secret", () => {
    expect(verifySession(signSession(session, secret), "other")).toBeNull();
  });
});

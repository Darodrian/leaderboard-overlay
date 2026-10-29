import { describe, it, expect } from "vitest";
import {
  canBindLicense,
  generateOpaqueToken,
  regenerateOverlayToken,
  tokenIsValid,
  encryptToken,
  decryptToken,
} from "./licensing";

describe("canBindLicense", () => {
  it("binds an unbound license", () =>
    expect(canBindLicense({ twitchUserId: null }, "tw1")).toBe(true));
  it("allows the same owner to log in again", () =>
    expect(canBindLicense({ twitchUserId: "tw1" }, "tw1")).toBe(true));
  it("rejects a different owner (no link sharing)", () =>
    expect(canBindLicense({ twitchUserId: "tw1" }, "tw2")).toBe(false));
});

describe("generateOpaqueToken", () => {
  it("is url-safe and long enough", () => {
    const token = generateOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });
  it("is unique", () =>
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken()));
});

describe("tokenIsValid", () => {
  it("accepts the active token", () =>
    expect(tokenIsValid({ token: "abc", isActive: true }, "abc")).toBe(true));
  it("rejects a regenerated-away token", () =>
    expect(tokenIsValid({ token: "new", isActive: true }, "old")).toBe(false));
  it("rejects inactive sessions", () =>
    expect(tokenIsValid({ token: "abc", isActive: false }, "abc")).toBe(false));
});

describe("regenerateOverlayToken", () => {
  it("regenerates to a new token and revokes the old one", () => {
    const result = regenerateOverlayToken({ token: "old", isActive: true }, "new");
    expect(result.token).toBe("new");
    expect(result.previousToken).toBe("old");
    expect(tokenIsValid({ token: result.token, isActive: result.isActive }, "old")).toBe(
      false,
    );
    expect(tokenIsValid({ token: result.token, isActive: result.isActive }, "new")).toBe(
      true,
    );
  });
});

describe("encryptToken", () => {
  it("round-trips", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    expect(decryptToken(encryptToken("secret", key), key)).toBe("secret");
  });
});

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type LicenseBinding = { twitchUserId: string | null };

export type TokenSession = { token: string; isActive: boolean };

export type RegeneratedToken = TokenSession & { previousToken: string };

export function canBindLicense(
  license: LicenseBinding,
  twitchUserId: string,
): boolean {
  if (!license.twitchUserId) return true;
  return license.twitchUserId === twitchUserId;
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function tokenIsValid(
  session: TokenSession,
  presented: string,
): boolean {
  return session.isActive && presented.length > 0 && session.token === presented;
}

export function regenerateOverlayToken(
  current: TokenSession,
  newToken: string,
): RegeneratedToken {
  return {
    token: newToken,
    isActive: true,
    previousToken: current.token,
  };
}

function encryptionKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

export function encryptToken(plain: string, keyBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyBase64), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptToken(cipherText: string, keyBase64: string): string {
  const [ivPart, tagPart, dataPart] = cipherText.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Malformed encrypted token");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(keyBase64),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

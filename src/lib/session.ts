import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type Session = {
  streamerId: string;
  twitchUserId: string;
  exp?: number;
};

export function signSession(
  session: Session,
  secret: string,
  now: number = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: session.exp ?? now + SESSION_TTL_MS }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(
  token: string,
  secret: string,
  now: number = Date.now(),
): Session | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Session;
    if (typeof session.exp !== "number" || session.exp <= now) return null;
    return session;
  } catch {
    return null;
  }
}

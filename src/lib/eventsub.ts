import type { EventType } from "./types";

export type ParsedEvent =
  | {
      kind: "credit";
      eventType: EventType;
      userId: string;
      username: string;
      amount: number;
      isAnonymous: boolean;
    }
  | { kind: "ignore"; reason: string };

const MAX_SKEW_MS = 5 * 60 * 1000;

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function computeHmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return bytesToHex(signature);
}

export async function verifyTwitchSignature(
  headers: Headers,
  rawBody: string,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  const messageId = headers.get("Twitch-Eventsub-Message-Id");
  const timestamp = headers.get("Twitch-Eventsub-Message-Timestamp");
  const provided = headers.get("Twitch-Eventsub-Signature");

  if (!messageId || !timestamp || !provided) return false;

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return false;
  if (Math.abs(now - timestampMs) > MAX_SKEW_MS) return false;

  const expected = `sha256=${await computeHmac(messageId + timestamp + rawBody, secret)}`;
  return safeEqual(provided, expected);
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function displayName(event: Record<string, unknown>): string {
  return toText(event.user_name) || toText(event.user_login);
}

/**
 * Maps a Twitch EventSub notification (or the internal `tip` donation source)
 * to a single credit or an explicit ignore. Gift recipients are always
 * ignored here so a gifted bundle is only counted once, on the gifter.
 */
export function parseEvent(
  subscriptionType: string,
  event: Record<string, unknown>,
): ParsedEvent {
  switch (subscriptionType) {
    case "channel.subscription.gift":
      return {
        kind: "credit",
        eventType: "gift",
        userId: toText(event.user_id),
        username: displayName(event),
        amount: toNumber(event.total),
        isAnonymous: event.is_anonymous === true,
      };

    case "channel.subscription.message":
      if (event.is_gift === true) {
        return { kind: "ignore", reason: "gift recipient" };
      }
      return {
        kind: "credit",
        eventType: "sub",
        userId: toText(event.user_id),
        username: displayName(event),
        amount: 1,
        isAnonymous: event.is_anonymous === true,
      };

    case "channel.subscription":
    case "channel.subscribe":
      if (event.is_gift === true) {
        return { kind: "ignore", reason: "gift recipient" };
      }
      return {
        kind: "credit",
        eventType: "sub",
        userId: toText(event.user_id),
        username: displayName(event),
        amount: 1,
        isAnonymous: event.is_anonymous === true,
      };

    case "channel.cheer":
      return {
        kind: "credit",
        eventType: "bit",
        userId: toText(event.user_id),
        username: displayName(event),
        amount: toNumber(event.bits),
        isAnonymous: event.is_anonymous === true,
      };

    case "channel.raid":
      return {
        kind: "credit",
        eventType: "raid",
        userId: toText(event.from_broadcaster_user_id),
        username:
          toText(event.from_broadcaster_user_name) ||
          toText(event.from_broadcaster_user_login),
        amount: toNumber(event.viewers),
        isAnonymous: false,
      };

    case "tip":
      return {
        kind: "credit",
        eventType: "tip",
        userId: toText(event.user_id),
        username: displayName(event),
        amount: toNumber(event.amount_cents),
        isAnonymous: event.is_anonymous === true,
      };

    default:
      return { kind: "ignore", reason: `unhandled subscription: ${subscriptionType}` };
  }
}

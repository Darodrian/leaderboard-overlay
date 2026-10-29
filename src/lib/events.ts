import { computePoints, shouldCredit } from "./points";
import { parseEvent } from "./eventsub";
import type { PointEventInput, Streamer } from "./types";

export type InsertResult = "inserted" | "duplicate";

export type EventDeps = {
  findStreamer: (twitchUserId: string) => Promise<Streamer | null>;
  insertPointEvent: (row: PointEventInput) => Promise<InsertResult>;
  flushAggregates: (streamerId: string) => Promise<void>;
  broadcast: (streamer: Streamer, payload: unknown) => Promise<void>;
  now?: () => number;
};

export type HandleEventInput = {
  subscriptionType: string;
  event: Record<string, unknown>;
  messageId: string;
  broadcasterUserId: string;
};

export type HandleEventResult =
  | "processed"
  | "ignored"
  | "duplicate"
  | "unknown-streamer";

export async function handleEvent(
  deps: EventDeps,
  input: HandleEventInput,
): Promise<HandleEventResult> {
  const streamer = await deps.findStreamer(input.broadcasterUserId);
  if (!streamer) return "unknown-streamer";

  const parsed = parseEvent(input.subscriptionType, input.event);
  if (parsed.kind === "ignore") return "ignored";

  if (!shouldCredit(parsed.eventType, parsed.amount, streamer.tipThresholdCents)) {
    return "ignored";
  }

  const points = computePoints(parsed.eventType, parsed.amount, streamer.pointConfig);
  if (points === 0) return "ignored";

  const creditedUsername = parsed.isAnonymous
    ? streamer.anonymousMaskName?.trim() || "Anonymous"
    : parsed.username;

  const row: PointEventInput = {
    streamerId: streamer.id,
    twitchEventId: input.messageId,
    eventType: parsed.eventType,
    creditedUserId: parsed.userId,
    creditedUsername,
    amountCents: parsed.amount,
    pointsAwarded: points,
    isAnonymous: parsed.isAnonymous,
    rawPayload: input.event,
  };

  const result = await deps.insertPointEvent(row);
  if (result === "duplicate") {
    // The original delivery may have inserted the row but failed before the
    // flush, so a retry repairs the aggregates instead of returning early.
    await deps.flushAggregates(streamer.id);
    return "duplicate";
  }

  await deps.flushAggregates(streamer.id);
  await deps.broadcast(streamer, {
    type: "leaderboard.update",
    streamerId: streamer.id,
    window: "this_stream",
  });

  return "processed";
}

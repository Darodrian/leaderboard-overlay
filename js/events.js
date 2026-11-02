import { computePoints, shouldCredit } from './points.js';
import { parseEvent } from './eventsub.js';

export async function handleEvent(deps, input) {
  const streamer = await deps.findStreamer(input.broadcasterUserId);
  if (!streamer) return 'unknown-streamer';

  const parsed = parseEvent(input.subscriptionType, input.event);
  if (parsed.kind === 'ignore') return 'ignored';

  if (!shouldCredit(parsed.eventType, parsed.amount, streamer.tipThresholdCents)) {
    return 'ignored';
  }

  const points = computePoints(parsed.eventType, parsed.amount, streamer.pointConfig);
  if (points === 0) return 'ignored';

  const creditedUsername = parsed.isAnonymous
    ? streamer.anonymousMaskName?.trim() || 'Anonymous'
    : parsed.username;

  const row = {
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
  if (result === 'duplicate') {
    await deps.flushAggregates(streamer.id);
    return 'duplicate';
  }

  await deps.flushAggregates(streamer.id);
  await deps.broadcast(streamer, {
    type: 'leaderboard.update',
    streamerId: streamer.id,
    window: 'this_stream',
  });

  return 'processed';
}

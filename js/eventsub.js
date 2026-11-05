const MAX_SKEW_MS = 5 * 60 * 1000;

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function computeHmac(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  );
  return bytesToHex(signature);
}

export async function verifyTwitchSignature(headers, rawBody, secret, now = Date.now()) {
  const messageId = headers.get('Twitch-Eventsub-Message-Id');
  const timestamp = headers.get('Twitch-Eventsub-Message-Timestamp');
  const provided = headers.get('Twitch-Eventsub-Signature');

  if (!messageId || !timestamp || !provided) return false;

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return false;
  if (Math.abs(now - timestampMs) > MAX_SKEW_MS) return false;

  const expected = `sha256=${await computeHmac(messageId + timestamp + rawBody, secret)}`;
  return safeEqual(provided, expected);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value) {
  return typeof value === 'string' ? value : '';
}

function displayName(event) {
  return toText(event.user_name) || toText(event.user_login);
}

export function parseEvent(subscriptionType, event) {
  switch (subscriptionType) {
    case 'channel.subscription.gift':
      return {
        kind: 'credit',
        eventType: 'gift',
        userId: toText(event.user_id),
        username: displayName(event),
        amount: toNumber(event.total),
        isAnonymous: event.is_anonymous === true,
      };

    case 'channel.subscription.message':
      if (event.is_gift === true) {
        return { kind: 'ignore', reason: 'gift recipient' };
      }
      return {
        kind: 'credit',
        eventType: 'sub',
        userId: toText(event.user_id),
        username: displayName(event),
        amount: 1,
        isAnonymous: event.is_anonymous === true,
      };

    case 'channel.subscription':
    case 'channel.subscribe':
      if (event.is_gift === true) {
        return { kind: 'ignore', reason: 'gift recipient' };
      }
      return {
        kind: 'credit',
        eventType: 'sub',
        userId: toText(event.user_id),
        username: displayName(event),
        amount: 1,
        isAnonymous: event.is_anonymous === true,
      };

    case 'channel.cheer':
      return {
        kind: 'credit',
        eventType: 'bit',
        userId: toText(event.user_id),
        username: displayName(event),
        amount: toNumber(event.bits),
        isAnonymous: event.is_anonymous === true,
      };

    // channel.bits.use is Twitch's newer all-purpose bits event. It fires for
    // cheers and for power-ups; only count cheers so power-ups don't inflate
    // the bits leaderboard.
    case 'channel.bits.use':
      if (event.type !== 'cheer') {
        return { kind: 'ignore', reason: 'power-up' };
      }
      return {
        kind: 'credit',
        eventType: 'bit',
        userId: toText(event.user_id),
        username: displayName(event),
        amount: toNumber(event.bits),
        isAnonymous: event.is_anonymous === true,
      };

    case 'channel.raid':
      return {
        kind: 'credit',
        eventType: 'raid',
        userId: toText(event.from_broadcaster_user_id),
        username:
          toText(event.from_broadcaster_user_name) ||
          toText(event.from_broadcaster_user_login),
        amount: toNumber(event.viewers),
        isAnonymous: false,
      };

    case 'tip':
      return {
        kind: 'credit',
        eventType: 'tip',
        userId: toText(event.user_id),
        username: displayName(event),
        amount: toNumber(event.amount_cents),
        isAnonymous: event.is_anonymous === true,
      };

    default:
      return { kind: 'ignore', reason: `unhandled subscription: ${subscriptionType}` };
  }
}

export function parseClipEvent(event) {
  const userId = toText(event.user_id);
  const username = displayName(event);
  const clipId = toText(event.id);

  if (!userId || !username || !clipId) return null;

  return { userId, username, clipId };
}

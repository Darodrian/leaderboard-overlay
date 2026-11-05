import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('BASE_URL') || Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TWITCH_WEBHOOK_SECRET = Deno.env.get('TWITCH_WEBHOOK_SECRET');

const ALLOWED_ORIGINS = (Deno.env.get('CORS_ORIGINS') || '*').split(',').map(s => s.trim())

function corsOrigin(origin) {
  if (origin && origin !== '*' && (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin))) return origin
  return ALLOWED_ORIGINS[0] || '*'
}

function corsHeaders(origin) {
  const o = corsOrigin(origin)
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-chat-bot-secret',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const MAX_SKEW_MS = 5 * 60 * 1000;

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computeHmac(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return bytesToHex(sig);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(headers, rawBody, secret, now = Date.now()) {
  const messageId = headers.get('twitch-eventsub-message-id') || headers.get('Twitch-Eventsub-Message-Id');
  const timestamp = headers.get('twitch-eventsub-message-timestamp') || headers.get('Twitch-Eventsub-Message-Timestamp');
  const provided = headers.get('twitch-eventsub-signature') || headers.get('Twitch-Eventsub-Signature');
  if (!messageId || !timestamp || !provided) return false;
  const tsMs = Date.parse(timestamp);
  if (!Number.isFinite(tsMs)) return false;
  if (Math.abs(now - tsMs) > MAX_SKEW_MS) return false;
  const expected = `sha256=${await computeHmac(messageId + timestamp + rawBody, secret)}`;
  return safeEqual(provided, expected);
}

function toNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function toText(v) { return typeof v === 'string' ? v : ''; }
function displayName(e) { return toText(e.user_name) || toText(e.user_login); }

function parseEvent(subscriptionType, event) {
  switch (subscriptionType) {
    case 'channel.subscription.gift':
      return { kind: 'credit', eventType: 'gift', userId: toText(event.user_id), username: displayName(event), amount: toNumber(event.total), isAnonymous: event.is_anonymous === true };
    case 'channel.subscription.message':
      if (event.is_gift === true) return { kind: 'ignore', reason: 'gift recipient' };
      return { kind: 'credit', eventType: 'sub', userId: toText(event.user_id), username: displayName(event), amount: 1, isAnonymous: event.is_anonymous === true };
    case 'channel.subscription':
    case 'channel.subscribe':
      if (event.is_gift === true) return { kind: 'ignore', reason: 'gift recipient' };
      return { kind: 'credit', eventType: 'sub', userId: toText(event.user_id), username: displayName(event), amount: 1, isAnonymous: event.is_anonymous === true };
    case 'channel.cheer':
      return { kind: 'credit', eventType: 'bit', userId: toText(event.user_id), username: displayName(event), amount: toNumber(event.bits), isAnonymous: event.is_anonymous === true };
    // channel.bits.use is Twitch's newer all-purpose bits event. It fires for
    // cheers and for power-ups; only count cheers so power-ups don't inflate
    // the bits leaderboard.
    case 'channel.bits.use':
      if (event.type !== 'cheer') {
        return { kind: 'ignore', reason: 'power-up' };
      }
      return { kind: 'credit', eventType: 'bit', userId: toText(event.user_id), username: displayName(event), amount: toNumber(event.bits), isAnonymous: event.is_anonymous === true };
    case 'channel.raid':
      return { kind: 'credit', eventType: 'raid', userId: toText(event.from_broadcaster_user_id), username: toText(event.from_broadcaster_user_name) || toText(event.from_broadcaster_user_login), amount: toNumber(event.viewers), isAnonymous: false };
    case 'tip':
      return { kind: 'credit', eventType: 'tip', userId: toText(event.user_id), username: displayName(event), amount: toNumber(event.amount_cents), isAnonymous: event.is_anonymous === true };
    default:
      return { kind: 'ignore', reason: `unhandled: ${subscriptionType}` };
  }
}

function computePoints(eventType, amount, config) {
  const safe = Number.isFinite(amount) ? amount : 0;
  const rate = typeof config[eventType] === 'number' && Number.isFinite(config[eventType]) ? config[eventType] : 0;
  const raw = eventType === 'tip' ? (safe / 100) * rate : safe * rate;
  return Math.max(0, Math.floor(raw));
}

function shouldCredit(eventType, amountCents, thresholdCents) {
  if (eventType !== 'tip') return true;
  return amountCents > 0 && amountCents >= thresholdCents;
}

export async function handler(request) {
  const origin = request.headers.get('origin') || '*'
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  const rawBody = await request.text();
  const headers = request.headers;
  const messageType = headers.get('twitch-eventsub-message-type') || headers.get('Twitch-Eventsub-Message-Type');

  if (!TWITCH_WEBHOOK_SECRET) {
    return new Response('webhook secret not configured', { status: 500, headers: corsHeaders(origin) });
  }

  if (!(await verifySignature(headers, rawBody, TWITCH_WEBHOOK_SECRET))) {
    return new Response('invalid signature', { status: 403, headers: corsHeaders(origin) });
  }

  if (messageType === 'webhook_callback_verification') {
    let body;
    try { body = JSON.parse(rawBody); } catch { return new Response('bad request', { status: 400, headers: corsHeaders(origin) }); }
    return new Response(body.challenge ?? '', { status: 200, headers: corsHeaders(origin) });
  }

  if (messageType === 'revocation') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  let body;
  try { body = JSON.parse(rawBody); } catch { return new Response('bad payload', { status: 400, headers: corsHeaders(origin) }); }

  const subscriptionType = body.subscription?.type;
  const broadcasterUserId = body.subscription?.condition?.broadcaster_user_id;
  const event = body.event;
  const messageId = headers.get('twitch-eventsub-message-id') || headers.get('Twitch-Eventsub-Message-Id');

  if (!subscriptionType || !broadcasterUserId || !event || !messageId) {
    return new Response('bad payload', { status: 400, headers: corsHeaders(origin) });
  }

  if (subscriptionType === 'channel.clip.created') {
    const userId = toText(event.user_id);
    const username = displayName(event);
    const clipId = toText(event.id);
    if (!userId || !username || !clipId) return new Response('bad clip payload', { status: 400, headers: corsHeaders(origin) });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const streamer = await supabase.from('streamers').select('*').eq('twitch_user_id', broadcasterUserId).maybeSingle();
    if (!streamer.data) return new Response(JSON.stringify({ error: 'streamer not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });

    await supabase.from('clip_events').insert({
      streamer_id: streamer.data.id,
      twitch_user_id: userId,
      username,
      clip_id: clipId,
    });
    return new Response(JSON.stringify({ result: 'processed' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: streamer } = await supabase
    .from('streamers')
    .select('*')
    .eq('twitch_user_id', broadcasterUserId)
    .maybeSingle();

  if (!streamer) {
    return new Response(JSON.stringify({ error: 'unknown-streamer' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  const parsed = parseEvent(subscriptionType, event);
  if (parsed.kind === 'ignore') return new Response(JSON.stringify({ result: 'ignored' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });

  if (!shouldCredit(parsed.eventType, parsed.amount, streamer.tip_threshold_cents)) {
    return new Response(JSON.stringify({ result: 'ignored' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  const points = computePoints(parsed.eventType, parsed.amount, streamer.point_config);
  if (points === 0) return new Response(JSON.stringify({ result: 'ignored' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });

  const creditedUsername = parsed.isAnonymous
    ? (streamer.anonymous_mask_name?.trim() || 'Anonymous')
    : parsed.username;

  const { error: insertError } = await supabase.from('point_events').insert({
    streamer_id: streamer.id,
    twitch_event_id: messageId,
    event_type: parsed.eventType,
    credited_user_id: parsed.userId,
    credited_username: creditedUsername,
    amount_cents: parsed.amount,
    points_awarded: points,
    is_anonymous: parsed.isAnonymous,
    raw_payload: event,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      await supabase.rpc('flush_streamer_aggregates', { p_streamer_id: streamer.id });
      return new Response(JSON.stringify({ result: 'duplicate' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
    }
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  await supabase.rpc('flush_streamer_aggregates', { p_streamer_id: streamer.id });

  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{
          topic: `overlay:${streamer.obs_token}`,
          event: 'leaderboard.update',
          payload: { type: 'leaderboard.update', streamerId: streamer.id, window: 'this_stream' },
        }],
      }),
    });
  } catch { /* non-fatal */ }

  return new Response(JSON.stringify({ result: 'processed' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
}

Deno.serve(handler);

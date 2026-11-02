import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function toNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function toText(v) { return typeof v === 'string' ? v : ''; }

export async function handler(request) {
  const url = new URL(request.url);
  const token = url.pathname.split('/').pop();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: streamer } = await supabase
    .from('streamers')
    .select('*')
    .eq('obs_token', token)
    .maybeSingle();

  if (!streamer || !streamer.obs_token || streamer.obs_token !== token) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  }

  // License check
  if (!streamer.license_key) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  }
  const { data: license } = await supabase
    .from('licenses')
    .select('is_active, expires_at')
    .eq('key', streamer.license_key)
    .maybeSingle();
  if (!license || !license.is_active) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });

  const body = await request.json().catch(() => null);
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const amountCents = Number(body?.amountCents);

  if (!eventId || !userId || !username || !Number.isFinite(amountCents) || amountCents < 0) {
    return new Response(JSON.stringify({ error: 'eventId, userId, username, and non-negative amountCents required' }), { status: 400 });
  }

  const isAnonymous = body?.isAnonymous === true;
  const threshold = streamer.tip_threshold_cents;
  if (amountCents <= 0 || amountCents < threshold) {
    return new Response(JSON.stringify({ result: 'ignored' }), { headers: { 'Content-Type': 'application/json' } });
  }

  const pointConfig = streamer.point_config || { tip: 100, bit: 1, sub: 500, gift: 300, raid: 50 };
  const points = Math.max(0, Math.floor((amountCents / 100) * (pointConfig.tip || 100)));

  const maskedUsername = isAnonymous ? (streamer.anonymous_mask_name?.trim() || 'Anonymous') : username;

  const { error: insertError } = await supabase.from('point_events').insert({
    streamer_id: streamer.id,
    twitch_event_id: eventId,
    event_type: 'tip',
    credited_user_id: userId,
    credited_username: maskedUsername,
    amount_cents: Math.floor(amountCents),
    points_awarded: points,
    is_anonymous: isAnonymous,
    raw_payload: body,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      await supabase.rpc('flush_streamer_aggregates', { p_streamer_id: streamer.id });
      return new Response(JSON.stringify({ result: 'duplicate' }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
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

  return new Response(JSON.stringify({ result: 'processed' }), { headers: { 'Content-Type': 'application/json' } });
}

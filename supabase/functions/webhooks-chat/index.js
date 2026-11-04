import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('BASE_URL') || Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CHAT_BOT_SECRET = Deno.env.get('CHAT_BOT_SECRET');

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

export async function handler(request) {
  const origin = request.headers.get('origin') || '*'
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

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

  if (!streamer) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const text = typeof body?.text === 'string' ? body.text : '';
  const isBot = body?.isBot === true;
  const isBroadcaster = body?.isBroadcaster === true;
  const isMod = body?.isMod === true;

  if (!userId || !username) {
    return new Response(JSON.stringify({ error: 'userId and username required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  // ---- Leaderboard chat commands (broadcaster + mods only) ----
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const isRefresh = normalized === '!leaderboard refresh';
  const isClearStream = normalized === '!leaderboard clear stream';
  const isModerator = userId === streamer.twitch_user_id || isBroadcaster || isMod;

  if (isRefresh || isClearStream) {
    if (!isModerator) {
      return new Response(JSON.stringify({ error: 'moderator only' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
    }

    if (isClearStream) {
      const now = new Date().toISOString();
      await supabase.from('stream_windows')
        .update({ is_active: false, ended_at: now })
        .eq('streamer_id', streamer.id)
        .eq('window_type', 'this_stream')
        .eq('is_active', true);
      await supabase.from('stream_windows').insert({
        streamer_id: streamer.id,
        window_type: 'this_stream',
        started_at: now,
        is_active: true,
      });
      await supabase.rpc('flush_streamer_aggregates', {
        p_streamer_id: streamer.id,
        p_force: true,
      });
    }

    const event = isRefresh ? 'command.refresh' : 'command.clear-stream';
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
            event,
            payload: { type: event },
          }],
        }),
      });
    } catch { /* non-fatal */ }

    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const shouldCount =
    !(streamer.exclude_broadcaster_from_chat_messages && isBroadcaster) &&
    !(streamer.exclude_mods_from_chat_messages && isMod);

  if (shouldCount) {
    const { error } = await supabase.from('chat_events').insert({
      streamer_id: streamer.id,
      twitch_user_id: userId,
      username,
      is_bot: isBot,
      is_broadcaster: isBroadcaster,
      is_mod: isMod,
    });
    if (error) return new Response(JSON.stringify({ error: 'chat event failed' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  await supabase.rpc('flush_streamer_aggregates', {
    p_streamer_id: streamer.id,
    p_force: true,
    p_board_type: null,
  });

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

  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

Deno.serve(handler);

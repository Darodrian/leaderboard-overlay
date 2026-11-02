import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CHAT_BOT_SECRET = Deno.env.get('CHAT_BOT_SECRET');

function secretMatches(provided, expected) {
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function handler(request) {
  const url = new URL(request.url);
  const token = url.pathname.split('/').pop();

  if (!CHAT_BOT_SECRET || !secretMatches(request.headers.get('x-chat-bot-secret'), CHAT_BOT_SECRET)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: streamer } = await supabase
    .from('streamers')
    .select('*')
    .eq('obs_token', token)
    .maybeSingle();

  if (!streamer) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const command = body?.command;
  if (command !== 'refresh' && command !== 'clear-stream') {
    return new Response(JSON.stringify({ error: 'invalid command' }), { status: 400 });
  }

  const badges = body?.badges ?? {};
  const userId = body?.userId ?? '';
  const broadcasterId = streamer.twitch_user_id;

  // Moderation check
  const canMod = userId === broadcasterId || Boolean(badges.broadcaster || badges.moderator);
  if (!canMod) {
    return new Response(JSON.stringify({ error: 'moderator only' }), { status: 403 });
  }

  if (command === 'clear-stream') {
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

  // Broadcast to overlay
  const event = command === 'refresh' ? 'command.refresh' : 'command.clear-stream';
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

  return new Response(JSON.stringify({ result: 'applied' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

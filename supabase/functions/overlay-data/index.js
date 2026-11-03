import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('BASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY');

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
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: streamer, error } = await supabase
    .from('streamers')
    .select('*')
    .eq('obs_token', token)
    .maybeSingle();

  if (error || !streamer) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  let flushPending = false;
  if (streamer.flush_pending) {
    const { data: flushed, error: flushError } = await supabase.rpc(
      'flush_streamer_aggregates',
      { p_streamer_id: streamer.id }
    );
    if (flushError) {
      return new Response(JSON.stringify({ error: 'flush failed' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
    }
    flushPending = flushed === false;
  }

  const { data: aggregateRows, error: aggregateError } = await supabase
    .from('leaderboard_aggregates')
    .select('window_type, board_type, user_id, username, quantity, last_event_at')
    .eq('streamer_id', streamer.id);

  if (aggregateError) {
    return new Response(JSON.stringify({ error: 'query failed' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  const ALL_BOARD_TYPES = ['points', 'donations', 'bits', 'subs', 'raiders', 'chat_messages', 'clips'];
  const WINDOW_TYPES = ['this_stream', '7d', '30d', 'alltime'];

  const boardRows = {};
  for (const bt of ALL_BOARD_TYPES) {
    boardRows[bt] = {};
    for (const w of WINDOW_TYPES) boardRows[bt][w] = [];
  }

  for (const row of aggregateRows ?? []) {
    if (!boardRows[row.board_type]?.[row.window_type]) continue;
    boardRows[row.board_type][row.window_type].push({
      userId: row.user_id,
      username: row.username,
      quantity: row.quantity,
      lastEventAt: row.last_event_at,
    });
  }

  for (const bt of ALL_BOARD_TYPES) {
    for (const w of WINDOW_TYPES) {
      boardRows[bt][w].sort((a, b) => b.quantity - a.quantity);
    }
  }

  const boards = streamer.boards ?? {};
  const DEFAULT_BOARDS = {
    points: { active: true, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 25 },
    donations: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
    bits: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
    subs: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
    raiders: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
    chat_messages: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
    clips: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
  };

  const boardStates = {};
  for (const bt of ALL_BOARD_TYPES) {
    const cfg = boards[bt] ?? DEFAULT_BOARDS[bt] ?? DEFAULT_BOARDS.points;
    const defaultWindow = cfg.windows[0] ?? 'this_stream';
    boardStates[bt] = {
      rows: boardRows[bt][defaultWindow].slice(0, cfg.rankCount),
      window: defaultWindow,
      rankCount: cfg.rankCount,
    };
  }

  const activeBoard = ALL_BOARD_TYPES.find((bt) => boards[bt]?.active) ?? 'points';

  const settings = {
    pointConfig: streamer.point_config,
    tipThresholdCents: streamer.tip_threshold_cents,
    anonymousMaskName: streamer.anonymous_mask_name,
    display: streamer.display_toggles,
    hiddenAccounts: streamer.hidden_accounts ?? [],
    layout: streamer.layout,
    visuals: streamer.visuals,
    theme: streamer.theme,
    rotation: streamer.rotation,
    boards: streamer.boards,
    screenLayout: streamer.screen_layout,
    rotationMode: streamer.rotation_mode,
    fontFamily: streamer.font_family,
    labelAlignment: streamer.label_alignment,
    boardLabels: streamer.board_labels ? JSON.parse(streamer.board_labels) : {},
    excludeBroadcasterFromChatMessages: streamer.exclude_broadcaster_from_chat_messages,
    excludeModsFromChatMessages: streamer.exclude_mods_from_chat_messages,
  };

  return new Response(
    JSON.stringify({
      boards: boardStates,
      settings,
      activeBoard,
      activeWindow: boardStates[activeBoard]?.window ?? 'this_stream',
      pending: flushPending,
    }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
  );
}

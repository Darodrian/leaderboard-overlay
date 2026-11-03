import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('BASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY');
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');

const ALLOWED_ORIGINS = (Deno.env.get('CORS_ORIGINS') || '*').split(',').map(s => s.trim())

function corsOrigin(origin) {
  if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) return origin || '*'
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

async function verifySession(token, secret, now = Date.now()) {
  const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected)));
  if (signature.length !== expectedB64.length) return null;
  let diff = 0;
  for (let i = 0; i < signature.length; i += 1) diff |= signature.charCodeAt(i) ^ expectedB64.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const session = JSON.parse(atob(payload));
    if (typeof session.exp !== 'number' || session.exp <= now) return null;
    return session;
  } catch { return null; }
}

function getCookie(cookieHeader, name) {
  const match = cookieHeader.match(new RegExp('(^|; )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function deepMerge(base, patch) {
  if (patch === undefined) return base;
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch) ||
      typeof base !== 'object' || base === null || Array.isArray(base)) return patch;
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (key === 'overrides' || key === 'boards') {
      result[key] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value) &&
               typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function clampSettings(settings) {
  const clamp = (v, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  settings.visuals.opacity = clamp(settings.visuals.opacity, 0, 100);
  settings.visuals.fontSize = clamp(settings.visuals.fontSize, 8, 72);
  settings.layout.width = clamp(settings.layout.width, 200, 800);
  settings.layout.padding = clamp(settings.layout.padding, 0, 48);
  settings.layout.borderRadius = clamp(settings.layout.borderRadius, 0, 999);
  settings.rotation.intervalMs = clamp(settings.rotation.intervalMs, 3000, 300000);
  settings.tipThresholdCents = clamp(settings.tipThresholdCents, 0, Number.MAX_SAFE_INTEGER);
  for (const k of Object.keys(settings.pointConfig)) {
    settings.pointConfig[k] = clamp(settings.pointConfig[k], 0, Number.MAX_SAFE_INTEGER);
  }
  const boolDefaults = { excludeBroadcasterFromChatMessages: false, excludeModsFromChatMessages: false };
  for (const [k, dv] of Object.entries(boolDefaults)) {
    if (typeof settings[k] !== 'boolean') settings[k] = dv;
  }
  const mask = typeof settings.anonymousMaskName === 'string' ? settings.anonymousMaskName.trim() : '';
  settings.anonymousMaskName = mask || 'Anonymous';
  if (!['single', 'side-by-side', 'stacked'].includes(settings.screenLayout)) settings.screenLayout = 'single';
  if (!['boards', 'windows', 'both'].includes(settings.rotationMode)) settings.rotationMode = 'both';
  if (typeof settings.fontFamily !== 'string' || settings.fontFamily.length === 0) settings.fontFamily = 'system';
  if (!['left', 'center', 'right'].includes(settings.labelAlignment)) settings.labelAlignment = 'center';
  const overrides = {};
  if (settings.theme && typeof settings.theme.overrides === 'object') {
    for (const [k, v] of Object.entries(settings.theme.overrides)) {
      if (/^--lb-[a-z0-9-]+$/.test(k) && typeof v === 'string') overrides[k] = v;
    }
  }
  settings.theme.overrides = overrides;
  return settings;
}

function applySettings(current, partial) {
  return clampSettings(deepMerge(JSON.parse(JSON.stringify(current)), partial));
}

export async function handler(request) {
  const origin = request.headers.get('origin') || '*'
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const token = getCookie(cookieHeader, 'lb_session');
  if (!token || !TOKEN_ENCRYPTION_KEY) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const session = await verifySession(token, TOKEN_ENCRYPTION_KEY);
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (request.method === 'GET') {
    const { data: streamer } = await supabase
      .from('streamers')
      .select('*')
      .eq('id', session.streamerId)
      .maybeSingle();

    if (!streamer) {
      return new Response(JSON.stringify({ error: 'streamer not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

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
      JSON.stringify({ settings, twitchLogin: streamer.twitch_login, obsToken: streamer.obs_token }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }

  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'invalid body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }
    const candidate = body.settings ?? body;
    if (!candidate || typeof candidate !== 'object') {
      return new Response(JSON.stringify({ error: 'invalid settings' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const { data: streamer } = await supabase
      .from('streamers')
      .select('*')
      .eq('id', session.streamerId)
      .maybeSingle();

    if (!streamer) {
      return new Response(JSON.stringify({ error: 'streamer not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const current = {
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

    let next;
    try {
      next = applySettings(current, candidate);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid settings' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const { error } = await supabase
      .from('streamers')
      .update({
        point_config: next.pointConfig,
        tip_threshold_cents: next.tipThresholdCents,
        anonymous_mask_name: next.anonymousMaskName,
        display_toggles: next.display,
        hidden_accounts: next.hiddenAccounts,
        layout: next.layout,
        visuals: next.visuals,
        theme: next.theme,
        rotation: next.rotation,
        boards: next.boards,
        screen_layout: next.screenLayout,
        rotation_mode: next.rotationMode,
        font_family: next.fontFamily,
        label_alignment: next.labelAlignment,
        board_labels: JSON.stringify(next.boardLabels),
        exclude_broadcaster_from_chat_messages: next.excludeBroadcasterFromChatMessages,
        exclude_mods_from_chat_messages: next.excludeModsFromChatMessages,
        updated_at: new Date().toISOString(),
      })
      .eq('id', streamer.id);

    if (error) {
      return new Response(JSON.stringify({ error: 'save failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

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
            event: 'settings.update',
            payload: { type: 'settings.update', settings: next },
          }],
        }),
      });
    } catch { /* broadcast failure is non-fatal */ }

    return new Response(JSON.stringify({ settings: next }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  return new Response(JSON.stringify({ error: 'method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

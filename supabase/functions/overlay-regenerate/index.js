import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('BASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY');
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:3000';

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

function generateToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

export async function handler(request) {
  const origin = request.headers.get('origin') || '*'
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const token = getCookie(cookieHeader, 'lb_session');
  if (!token || !TOKEN_ENCRYPTION_KEY) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  const session = await verifySession(token, TOKEN_ENCRYPTION_KEY);
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: streamer, error } = await supabase
    .from('streamers')
    .select('obs_token')
    .eq('id', session.streamerId)
    .maybeSingle();

  if (error || !streamer) {
    return new Response(JSON.stringify({ error: 'streamer not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  const newToken = generateToken(32);

  const { error: updateError } = await supabase
    .from('streamers')
    .update({
      obs_token: newToken,
      obs_token_regenerated_at: new Date().toISOString(),
    })
    .eq('id', session.streamerId);

  if (updateError) {
    return new Response(JSON.stringify({ error: 'regeneration failed' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
  }

  await supabase.from('overlay_sessions')
    .update({ is_active: false })
    .eq('streamer_id', session.streamerId)
    .eq('token', streamer.obs_token);

  await supabase.from('overlay_sessions').insert({
    streamer_id: session.streamerId,
    token: newToken,
    is_active: true,
  });

  return new Response(
    JSON.stringify({
      token: newToken,
      url: new URL(`/overlay.html?token=${newToken}`, APP_URL).toString(),
    }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
  );
}

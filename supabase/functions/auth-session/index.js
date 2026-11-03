import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('BASE_URL') || Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const COOKIE_NAME = 'lb_session';

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

function getCookie(cookieHeader, name) {
  const match = cookieHeader.match(new RegExp('(^|; )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function getBearerToken(request) {
  const header = request.headers.get('authorization') || '';
  return header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : null;
}

async function verifySession(token, secret, now = Date.now()) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const expected = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(payload)
  );
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected)));
  if (signature.length !== expectedB64.length) return null;
  let diff = 0;
  for (let i = 0; i < signature.length; i += 1) {
    diff |= signature.charCodeAt(i) ^ expectedB64.charCodeAt(i);
  }
  if (diff !== 0) return null;
  try {
    const session = JSON.parse(atob(payload));
    if (typeof session.exp !== 'number' || session.exp <= now) return null;
    return session;
  } catch { return null; }
}

export async function handler(request) {
  const origin = request.headers.get('origin') || '*'
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token =
    getBearerToken(request) ||
    getCookie(request.headers.get('cookie') || '', COOKIE_NAME);
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

  const { data: streamer } = await supabase
    .from('streamers')
    .select('twitch_login')
    .eq('id', session.streamerId)
    .maybeSingle();

  return new Response(
    JSON.stringify({
      streamerId: session.streamerId,
      twitchUserId: session.twitchUserId,
      twitchLogin: streamer?.twitch_login ?? '',
    }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
  );
}

Deno.serve(handler);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const COOKIE_NAME = 'lb_session';

function getCookie(cookieHeader, name) {
  const match = cookieHeader.match(new RegExp('(^|; )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
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
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = getCookie(request.headers.get('cookie') || '', COOKIE_NAME);
  if (!token || !TOKEN_ENCRYPTION_KEY) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = await verifySession(token, TOKEN_ENCRYPTION_KEY);
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
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
    { headers: { 'Content-Type': 'application/json' } }
  );
}

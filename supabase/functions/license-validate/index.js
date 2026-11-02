import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');

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
  const cookieHeader = request.headers.get('cookie') || '';
  const token = getCookie(cookieHeader, 'lb_session');
  if (!token || !TOKEN_ENCRYPTION_KEY) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const session = await verifySession(token, TOKEN_ENCRYPTION_KEY);
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await request.json().catch(() => null);
  const licenseKey = body?.licenseKey?.trim();
  if (!licenseKey) {
    return new Response(JSON.stringify({ error: 'license key required' }), { status: 400 });
  }

  const { data: license, error } = await supabase
    .from('licenses')
    .select('*')
    .eq('key', licenseKey)
    .maybeSingle();

  if (error || !license) {
    return new Response(JSON.stringify({ error: 'invalid license' }), { status: 404 });
  }
  if (!license.is_active) {
    return new Response(JSON.stringify({ error: 'license inactive' }), { status: 403 });
  }
  if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) {
    return new Response(JSON.stringify({ error: 'license expired' }), { status: 403 });
  }

  const canBind = !license.twitch_user_id || license.twitch_user_id === session.twitchUserId;
  if (!canBind) {
    return new Response(JSON.stringify({ error: 'license already bound to another account' }), { status: 409 });
  }

  if (!license.twitch_user_id) {
    const { data: bound, error: bindError } = await supabase
      .from('licenses')
      .update({ twitch_user_id: session.twitchUserId, bound_at: new Date().toISOString() })
      .eq('key', licenseKey)
      .is('twitch_user_id', null)
      .select('key');

    if (bindError) {
      return new Response(JSON.stringify({ error: 'binding failed' }), { status: 500 });
    }

    if (!bound || bound.length === 0) {
      const { data: current } = await supabase
        .from('licenses')
        .select('twitch_user_id')
        .eq('key', licenseKey)
        .maybeSingle();
      if (current?.twitch_user_id !== session.twitchUserId) {
        return new Response(JSON.stringify({ error: 'license already bound to another account' }), { status: 409 });
      }
    }
  }

  const { error: streamerError } = await supabase
    .from('streamers')
    .update({ license_key: licenseKey })
    .eq('id', session.streamerId);

  if (streamerError) {
    return new Response(JSON.stringify({ error: 'binding failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, boundTwitchUserId: session.twitchUserId }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

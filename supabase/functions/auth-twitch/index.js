import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');
const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID');
const TWITCH_CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const OAUTH_STATE_COOKIE = 'twitch_oauth_state';

const AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const USERS_URL = 'https://api.twitch.tv/helix/users';

function generateToken(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getCookie(cookieHeader, name) {
  const match = cookieHeader.match(new RegExp('(^|; )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

async function signSession(session, secret, now = Date.now()) {
  const payload = btoa(JSON.stringify({ ...session, exp: session.exp ?? now + SESSION_TTL_MS }));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${payload}.${sigB64}`;
}

async function encryptToken(plain, keyBase64) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(keyBase64),
    { name: 'AES-GCM' }, false, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain)
  );
  const tag = new Uint8Array(encrypted).slice(-16);
  const data = new Uint8Array(encrypted).slice(0, -16);
  return [
    btoa(String.fromCharCode(...iv)),
    btoa(String.fromCharCode(...tag)),
    btoa(String.fromCharCode(...data)),
  ].join('.');
}

export async function handler(request) {
  const url = new URL(request.url);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Callback: Twitch redirects back with ?code and ?state ----
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (code) {
    const cookieHeader = request.headers.get('cookie') || '';
    const storedState = getCookie(cookieHeader, OAUTH_STATE_COOKIE);

    if (!code || !state || !storedState || state !== storedState) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/?error=twitch_login_failed' },
      });
    }

    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !TOKEN_ENCRYPTION_KEY) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/?error=twitch_not_configured' },
      });
    }

    const redirectUri =
      Deno.env.get('TWITCH_REDIRECT_URI') ??
      `${url.origin}/functions/v1/auth-twitch`;

    try {
      // Exchange code for tokens
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: TWITCH_CLIENT_ID,
          client_secret: TWITCH_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        return new Response(null, {
          status: 302,
          headers: { Location: '/?error=twitch_login_failed' },
        });
      }

      const tokens = await tokenRes.json();

      // Fetch Twitch user
      const userRes = await fetch(USERS_URL, {
        headers: {
          'Client-Id': TWITCH_CLIENT_ID,
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      const userJson = await userRes.json();
      const user = userJson.data?.[0];
      if (!user?.id) {
        return new Response(null, {
          status: 302,
          headers: { Location: '/?error=twitch_login_failed' },
        });
      }

      const encryptedToken = await encryptToken(tokens.access_token, TOKEN_ENCRYPTION_KEY);

      // Find or create streamer
      let streamerId;
      const { data: existing } = await supabase
        .from('streamers')
        .select('id')
        .eq('twitch_user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('streamers')
          .update({ twitch_login: user.login, access_token: encryptedToken })
          .eq('id', existing.id);
        streamerId = existing.id;
      } else {
        const { data: created } = await supabase
          .from('streamers')
          .insert({
            twitch_user_id: user.id,
            twitch_login: user.login,
            access_token: encryptedToken,
            obs_token: generateToken(32),
          })
          .select('id')
          .single();
        streamerId = created.id;
      }

      // Set session cookie
      const sessionToken = await signSession(
        { streamerId, twitchUserId: user.id },
        TOKEN_ENCRYPTION_KEY
      );

      const response = new Response(null, {
        status: 302,
        headers: { Location: '/dashboard.html' },
      });
      response.headers.set(
        'Set-Cookie',
        `lb_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
      );
      response.headers.set(
        'Set-Cookie',
        `twitch_oauth_state=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
      );
      return response;
    } catch {
      return new Response(null, {
        status: 302,
        headers: { Location: '/?error=twitch_login_failed' },
      });
    }
  }

  // ---- Start: redirect to Twitch OAuth ----
  const clientId = TWITCH_CLIENT_ID;
  if (!clientId) {
    return new Response('Twitch OAuth is not configured', { status: 500 });
  }

  const redirectUri = url.searchParams.get('redirect') ||
    Deno.env.get('TWITCH_REDIRECT_URI') ||
    `${url.origin}/functions/v1/auth-twitch`;

  const state = generateToken(16);
  const authUrl = new URL(AUTHORIZE_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'user:read:email moderator:read:chatters');
  authUrl.searchParams.set('state', state);

  const response = new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
  response.headers.set(
    'Set-Cookie',
    `twitch_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
  );
  return response;
}

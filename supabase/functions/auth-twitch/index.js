import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL = Deno.env.get('BASE_URL') || Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');
const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID');
const TWITCH_CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const OAUTH_STATE_COOKIE = 'twitch_oauth_state';
const OAUTH_STATE_MAX_AGE = 600;

const AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const USERS_URL = 'https://api.twitch.tv/helix/users';
const TWITCH_API = 'https://api.twitch.tv/helix';

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
  const enc = new Uint8Array(encrypted);
  const tag = enc.slice(-16);
  const data = enc.slice(0, -16);
  return [
    btoa(String.fromCharCode(...iv)),
    btoa(String.fromCharCode(...tag)),
    btoa(String.fromCharCode(...data)),
  ].join('.');
}

function fallbackDashboardUrl(requestUrl) {
  return Deno.env.get('DASHBOARD_URL') || Deno.env.get('APP_URL') || `${requestUrl.origin}/`;
}

function sanitizeDashboard(value, requestUrl) {
  if (value) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
    } catch { /* not a URL, fall back */ }
  }
  return fallbackDashboardUrl(requestUrl);
}

// The dashboard origin travels inside `state` so Twitch's redirect_uri can stay
// fixed on this function.
function dashboardBaseFromState(state, requestUrl) {
  if (state) {
    const sep = state.indexOf('|');
    if (sep !== -1) {
      try {
        const value = decodeURIComponent(state.slice(sep + 1));
        if (/^https?:\/\//i.test(value)) return value;
      } catch { /* malformed state, fall through */ }
    }
  }
  return fallbackDashboardUrl(requestUrl);
}

function dashboardTarget(base, params = {}) {
  const dir = base.endsWith('/') ? base : base + '/';
  const target = new URL('dashboard.html', dir);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      target.searchParams.set(key, value);
    }
  }
  return target;
}

function resolveRedirectUri(requestUrl) {
  const configured = Deno.env.get('TWITCH_REDIRECT_URI');
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.pathname.includes('/functions/v1/')) {
        parsed.protocol = 'https:';
        return parsed.toString();
      }
    } catch { /* malformed, fall through */ }
  }
  const url = new URL(requestUrl);
  url.protocol = 'https:';
  return `${url.origin}/functions/v1/auth-twitch`;
}

const EVENT_SUB_SUBSCRIPTIONS = [
  { type: 'channel.cheer', version: '1' },
  { type: 'channel.bits.use', version: '1' },
  { type: 'channel.subscribe', version: '1' },
  { type: 'channel.subscription.message', version: '1' },
  { type: 'channel.subscription.gift', version: '1' },
  { type: 'channel.raid', version: '1' },
];

// Creates the EventSub webhook subscriptions that feed webhooks-twitch so
// bits, subs, gifts, and raids land on the leaderboard. Best-effort: failures
// are logged but never block the OAuth flow.
async function createEventSubSubscriptions(accessToken, broadcasterUserId) {
  const callbackUrl = `${SUPABASE_URL}/functions/v1/webhooks-twitch`;
  const secret = TWITCH_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[auth-twitch] TWITCH_WEBHOOK_SECRET not configured; skipping EventSub subscriptions');
    return;
  }
  for (const { type, version } of EVENT_SUB_SUBSCRIPTIONS) {
    const body = {
      type,
      version,
      condition: { broadcaster_user_id: broadcasterUserId },
      transport: { method: 'webhook', callback: callbackUrl, secret },
    };
    try {
      const res = await fetch(`${TWITCH_API}/eventsub/subscriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        console.log(`[auth-twitch] EventSub ${type} already subscribed`);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(`[auth-twitch] EventSub ${type} subscribe failed ${res.status} ${text}`);
      } else {
        console.log(`[auth-twitch] EventSub ${type} subscribed`);
      }
    } catch (e) {
      console.warn(`[auth-twitch] EventSub ${type} subscribe error`, e);
    }
  }
}

function redirectTo(location, cookies = []) {
  const headers = new Headers({ Location: location.toString() });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

export async function handler(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin') || '*'

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const oauthError = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const incomingState = url.searchParams.get('state');

  // ---- Callback: Twitch redirects back with ?code and ?state ----
  if (code || oauthError) {
    const dashboardBase = dashboardBaseFromState(incomingState, url);
    const cookieHeader = request.headers.get('cookie') || '';
    const storedState = getCookie(cookieHeader, OAUTH_STATE_COOKIE);
    const clearStateCookie =
      `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0`;

    if (oauthError) {
      return redirectTo(dashboardTarget(dashboardBase, { error: oauthError }), [clearStateCookie]);
    }

    if (!incomingState || !storedState || incomingState !== storedState) {
      return redirectTo(dashboardTarget(dashboardBase, { error: 'twitch_state_mismatch' }), [clearStateCookie]);
    }

    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !TOKEN_ENCRYPTION_KEY) {
      return redirectTo(dashboardTarget(dashboardBase, { error: 'twitch_not_configured' }), [clearStateCookie]);
    }

    const redirectUri = resolveRedirectUri(url);

    try {
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
        console.error('[auth-twitch] token exchange failed', tokenRes.status, await tokenRes.text());
        return redirectTo(dashboardTarget(dashboardBase, { error: 'twitch_login_failed' }), [clearStateCookie]);
      }

      const tokens = await tokenRes.json();

      const userRes = await fetch(USERS_URL, {
        headers: {
          'Client-Id': TWITCH_CLIENT_ID,
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      const userJson = await userRes.json();
      const user = userJson.data?.[0];
      if (!user?.id) {
        console.error('[auth-twitch] user lookup failed', userJson);
        return redirectTo(dashboardTarget(dashboardBase, { error: 'twitch_login_failed' }), [clearStateCookie]);
      }

      // Best-effort: create EventSub subscriptions so bits/subs/raids events
      // flow into webhooks-twitch. Non-blocking — auth completes even if this fails.
      createEventSubSubscriptions(tokens.access_token, user.id).catch(() => {});

      const encryptedToken = await encryptToken(tokens.access_token, TOKEN_ENCRYPTION_KEY);

      let streamerId;
      const { data: existing, error: lookupError } = await supabase
        .from('streamers')
        .select('id')
        .eq('twitch_user_id', user.id)
        .maybeSingle();
      if (lookupError) throw lookupError;

      if (existing) {
        const { error: updateError } = await supabase
          .from('streamers')
          .update({ twitch_login: user.login, access_token: encryptedToken })
          .eq('id', existing.id);
        if (updateError) throw updateError;
        streamerId = existing.id;
      } else {
        const { data: created, error: insertError } = await supabase
          .from('streamers')
          .insert({
            twitch_user_id: user.id,
            twitch_login: user.login,
            access_token: encryptedToken,
            obs_token: generateToken(32),
          })
          .select('id')
          .single();
        if (insertError) throw insertError;
        streamerId = created.id;
      }

      const sessionToken = await signSession(
        { streamerId, twitchUserId: user.id },
        TOKEN_ENCRYPTION_KEY
      );

      const target = dashboardTarget(dashboardBase, {
        connected: user.login,
        broadcaster_id: streamerId,
      });
      target.hash = 'session=' + encodeURIComponent(sessionToken);

      return redirectTo(target, [
        `lb_session=${sessionToken}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
        clearStateCookie,
      ]);
    } catch (err) {
      console.error('[auth-twitch] callback failed', err);
      return redirectTo(dashboardTarget(dashboardBase, { error: 'twitch_login_failed' }), [clearStateCookie]);
    }
  }

  // ---- Start: redirect to Twitch OAuth ----
  const clientId = TWITCH_CLIENT_ID;
  if (!clientId) {
    return new Response('Twitch OAuth is not configured', {
      status: 500,
      headers: corsHeaders(origin),
    });
  }

  const dashboardBase = sanitizeDashboard(url.searchParams.get('redirect'), url);
  const redirectUri = resolveRedirectUri(url);

  const nonce = generateToken(16);
  const state = `${nonce}|${encodeURIComponent(dashboardBase)}`;

  const authUrl = new URL(AUTHORIZE_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'user:read:email moderator:read:chatters bits:read channel:read:subscriptions channel:read:raids');
  authUrl.searchParams.set('state', state);

  return redirectTo(authUrl, [
    `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${OAUTH_STATE_MAX_AGE}`,
  ]);
}

Deno.serve(handler);

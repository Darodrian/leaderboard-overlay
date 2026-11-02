// Client-side session helpers. The `lb_session` cookie is set by the
// auth-twitch edge function (httpOnly) and sent automatically with requests.
// These helpers read/write the cookie for UI purposes only.
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const COOKIE_NAME = 'lb_session';

export function getSessionCookie() {
  const match = document.cookie.match(
    new RegExp('(^|; )' + COOKIE_NAME + '=([^;]+)')
  );
  return match ? decodeURIComponent(match[2]) : null;
}

export function clearSessionCookie() {
  document.cookie = `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

async function importHmacKey(secret, usages) {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

// Sign and verify with the same key (sign + verify usages).
async function importHmacKeyFull(secret) {
  return await importHmacKey(secret, ['sign', 'verify']);
}

export async function signSession(session, secret, now = Date.now()) {
  const payload = btoa(
    JSON.stringify({ ...session, exp: session.exp ?? now + SESSION_TTL_MS })
  );
  const key = await importHmacKey(secret, ['sign']);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${payload}.${sigB64}`;
}

export async function verifySession(token, secret, now = Date.now()) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const key = await importHmacKeyFull(secret);
  const expected = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
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
  } catch {
    return null;
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifySession, SESSION_TTL_MS } from '../js/session.js';

const secret = 'session-secret';
const session = { streamerId: 's1', twitchUserId: 'tw1' };

test('session round-trips', async () => {
  const token = await signSession(session, secret);
  const verified = await verifySession(token, secret);
  assert.strictEqual(verified.streamerId, session.streamerId);
  assert.strictEqual(verified.twitchUserId, session.twitchUserId);
  assert.ok(typeof verified.exp === 'number');
});

test('session stamps expiry when signing', async () => {
  const now = 1_700_000_000_000;
  const token = await signSession(session, secret, now);
  const verified = await verifySession(token, secret, now);
  assert.ok(verified.exp > now);
});

test('session rejects expired session', async () => {
  const issuedAt = 1_700_000_000_000;
  const token = await signSession(session, secret, issuedAt);
  const verified = await verifySession(token, secret, issuedAt + SESSION_TTL_MS + 1000);
  assert.strictEqual(verified, null);
});

test('session rejects tampered payload', async () => {
  const token = await signSession(session, secret);
  const [, sig] = token.split('.');
  const forged = btoa(JSON.stringify({ streamerId: 's2', twitchUserId: 'tw2', exp: 9e15 }));
  const verified = await verifySession(`${forged}.${sig}`, secret);
  assert.strictEqual(verified, null);
});

test('session rejects token signed with another secret', async () => {
  const token = await signSession(session, secret);
  const verified = await verifySession(token, 'other');
  assert.strictEqual(verified, null);
});

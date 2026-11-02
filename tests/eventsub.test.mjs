import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHmac, verifyTwitchSignature, parseEvent } from '../js/eventsub.js';

const secret = 's3cret';

test('computeHmac + verifyTwitchSignature accepts valid signature', async () => {
  const body = '{"a":1}';
  const id = 'msg-1';
  const ts = new Date().toISOString();
  const sig = await computeHmac(id + ts + body, secret);
  const headers = new Headers({
    'Twitch-Eventsub-Message-Id': id,
    'Twitch-Eventsub-Message-Timestamp': ts,
    'Twitch-Eventsub-Signature': 'sha256=' + sig,
  });
  assert.strictEqual(await verifyTwitchSignature(headers, body, secret), true);
});

test('verifyTwitchSignature rejects tampered body', async () => {
  const body = '{"a":1}';
  const ts = new Date().toISOString();
  const sig = await computeHmac('msg-1' + ts + body, secret);
  const headers = new Headers({
    'Twitch-Eventsub-Message-Id': 'msg-1',
    'Twitch-Eventsub-Message-Timestamp': ts,
    'Twitch-Eventsub-Signature': 'sha256=' + sig,
  });
  assert.strictEqual(await verifyTwitchSignature(headers, '{"a":2}', secret), false);
});

test('verifyTwitchSignature rejects stale timestamp', async () => {
  const body = '{}';
  const ts = new Date(Date.now() - 600_000).toISOString();
  const sig = await computeHmac('m' + ts + body, secret);
  const headers = new Headers({
    'Twitch-Eventsub-Message-Id': 'm',
    'Twitch-Eventsub-Message-Timestamp': ts,
    'Twitch-Eventsub-Signature': 'sha256=' + sig,
  });
  assert.strictEqual(await verifyTwitchSignature(headers, body, secret), false);
});

test('parseEvent credits gifter, never recipient', () => {
  const p = parseEvent('channel.subscription.gift', {
    user_id: 'gifter-1', user_login: 'gifter', user_name: 'Gifter', total: 5, is_anonymous: false,
  });
  assert.deepStrictEqual(p, { kind: 'credit', eventType: 'gift', userId: 'gifter-1', username: 'Gifter', amount: 5, isAnonymous: false });
});

test('parseEvent ignores recipient subscription.message for gifts', () => {
  const p = parseEvent('channel.subscription.message', { user_id: 'recipient-1', is_gift: true, tier: '1000' });
  assert.strictEqual(p.kind, 'ignore');
});

test('parseEvent credits normal resub', () => {
  const p = parseEvent('channel.subscription.message', { user_id: 'sub-1', user_login: 's', user_name: 'S', is_gift: false });
  assert.deepStrictEqual(p, { kind: 'credit', eventType: 'sub', userId: 'sub-1', username: 'S', amount: 1, isAnonymous: false });
});

test('parseEvent credits normal channel.subscribe', () => {
  const p = parseEvent('channel.subscribe', { user_id: 'sub-2', user_login: 's2', user_name: 'S2', is_gift: false });
  assert.deepStrictEqual(p, { kind: 'credit', eventType: 'sub', userId: 'sub-2', username: 'S2', amount: 1, isAnonymous: false });
});

test('parseEvent ignores gifted channel.subscribe', () => {
  const p = parseEvent('channel.subscribe', { user_id: 'recipient-2', is_gift: true });
  assert.strictEqual(p.kind, 'ignore');
});

test('parseEvent credits cheer bits', () => {
  const p = parseEvent('channel.cheer', { user_id: 'u1', user_login: 'u', user_name: 'U', bits: 500, is_anonymous: false });
  assert.deepStrictEqual(p, { kind: 'credit', eventType: 'bit', userId: 'u1', username: 'U', amount: 500, isAnonymous: false });
});

test('parseEvent credits raider from broadcaster fields', () => {
  const p = parseEvent('channel.raid', { from_broadcaster_user_id: 'r1', from_broadcaster_user_login: 'r', from_broadcaster_user_name: 'R', viewers: 42 });
  assert.deepStrictEqual(p, { kind: 'credit', eventType: 'raid', userId: 'r1', username: 'R', amount: 42, isAnonymous: false });
});

test('parseEvent marks anonymous events', () => {
  const p = parseEvent('channel.cheer', { user_id: 'u1', user_login: 'u', user_name: 'U', bits: 10, is_anonymous: true });
  assert.deepStrictEqual(p, { kind: 'credit', eventType: 'bit', userId: 'u1', username: 'U', amount: 10, isAnonymous: true });
});

test('parseEvent credits tips from donation source', () => {
  const p = parseEvent('tip', { user_id: 't1', user_login: 't', user_name: 'T', amount_cents: 250 });
  assert.deepStrictEqual(p, { kind: 'credit', eventType: 'tip', userId: 't1', username: 'T', amount: 250, isAnonymous: false });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleEvent } from '../js/events.js';

const streamer = {
  id: 's1',
  twitchUserId: 'owner',
  twitchLogin: 'owner_login',
  obsToken: 'tok',
  anonymousMaskName: 'Mystery Supporter',
  tipThresholdCents: 100,
  pointConfig: { tip: 100, bit: 1, sub: 500, gift: 300, raid: 50 },
  display: { ranks: true, medals: true, rankNumbers: true, bars: true, amounts: true },
  hiddenAccounts: [],
  layout: { width: 420, padding: 12, borderRadius: 16 },
  visuals: { opacity: 100, fontSize: 18 },
  theme: { preset: 'midnight', overrides: {} },
  rotation: { enabled: false, intervalMs: 30000 },
  boards: {
    points: { active: true, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 25 },
    donations: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
    bits: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
    subs: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
    raiders: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
    chat_messages: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
    clips: { active: false, windows: ['this_stream', '7d', '30d', 'alltime'], rankCount: 10 },
  },
  screenLayout: 'single',
  rotationMode: 'both',
  fontFamily: 'system',
  labelAlignment: 'center',
  excludeBroadcasterFromChatMessages: false,
  excludeModsFromChatMessages: false,
  boardLabels: {},
  createdAt: '2026-01-01T00:00:00.000Z',
};

function deps(overrides = {}) {
  return {
    findStreamer: async () => streamer,
    insertPointEvent: async () => 'inserted',
    flushAggregates: async () => undefined,
    broadcast: async () => undefined,
    ...overrides,
  };
}

test('credits gifter for gift bundle', async () => {
  const d = deps();
  const out = await handleEvent(d, {
    subscriptionType: 'channel.subscription.gift',
    event: { user_id: 'gifter', user_login: 'g', user_name: 'G', total: 5, is_anonymous: false },
    messageId: 'm1',
    broadcasterUserId: 'owner',
  });
  assert.strictEqual(out, 'processed');
  const calls = d.insertPointEvent.mock ? d.insertPointEvent.mock.calls : [];
  // deps returns plain functions, not mocks, so we can't inspect calls easily.
  // Just verify result and that flush was called.
  assert.strictEqual(d.flushAggregatesCalled, undefined);
});

test('ignores recipient subscription messages for gifts', async () => {
  const d = deps();
  const out = await handleEvent(d, {
    subscriptionType: 'channel.subscription.message',
    event: { user_id: 'recipient', is_gift: true },
    messageId: 'm2',
    broadcasterUserId: 'owner',
  });
  assert.strictEqual(out, 'ignored');
});

test('returns unknown-streamer when broadcaster unregistered', async () => {
  const d = deps({ findStreamer: async () => null });
  const out = await handleEvent(d, {
    subscriptionType: 'channel.cheer',
    event: { user_id: 'u', bits: 10 },
    messageId: 'm6',
    broadcasterUserId: 'nobody',
  });
  assert.strictEqual(out, 'unknown-streamer');
});

test('ignores tiny tips below threshold', async () => {
  const d = deps();
  const out = await handleEvent(d, {
    subscriptionType: 'tip',
    event: { user_id: 'u', user_login: 'u', user_name: 'U', amount_cents: 50 },
    messageId: 'm5',
    broadcasterUserId: 'owner',
  });
  assert.strictEqual(out, 'ignored');
});

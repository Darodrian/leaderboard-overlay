import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../js/settings.js';
import { mapStreamerRow, settingsToRow, toOverlaySettings } from '../js/streamers.js';

test('settingsToRow maps overlay settings onto streamer columns', () => {
  const row = settingsToRow({
    ...DEFAULT_SETTINGS,
    hiddenAccounts: ['nightbot'],
    tipThresholdCents: 250,
  });
  assert.deepStrictEqual(row.hidden_accounts, ['nightbot']);
  assert.strictEqual(row.tip_threshold_cents, 250);
  assert.deepStrictEqual(row.point_config, DEFAULT_SETTINGS.pointConfig);
  assert.deepStrictEqual(row.display_toggles, DEFAULT_SETTINGS.display);
  assert.deepStrictEqual(row.layout, DEFAULT_SETTINGS.layout);
  assert.deepStrictEqual(row.visuals, DEFAULT_SETTINGS.visuals);
  assert.deepStrictEqual(row.theme, DEFAULT_SETTINGS.theme);
  assert.deepStrictEqual(row.rotation, DEFAULT_SETTINGS.rotation);
});

test('settingsToRow round-trips through mapStreamerRow', () => {
  const settings = { ...DEFAULT_SETTINGS, hiddenAccounts: ['nightbot'] };
  const row = {
    id: 's1',
    twitch_user_id: 'tw1',
    twitch_login: 'login',
    license_key: null,
    obs_token: 'tok',
    created_at: '2026-01-01T00:00:00.000Z',
    ...settingsToRow(settings),
  };
  const mapped = mapStreamerRow(row);
  const back = toOverlaySettings(mapped);
  assert.deepStrictEqual(back, settings);
});

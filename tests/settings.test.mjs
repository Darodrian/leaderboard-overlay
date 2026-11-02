import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  applySettings,
  mergeSettings,
  THEMES,
  cssVars,
  nextRotationWindow,
} from '../js/settings.js';

test('mergeSettings preserves defaults for omitted keys', () => {
  const settings = mergeSettings({ display: { medals: false } });
  assert.strictEqual(settings.display.medals, false);
  assert.strictEqual(settings.display.bars, DEFAULT_SETTINGS.display.bars);
});

test('mergeSettings clamps opacity into 0..100', () => {
  assert.strictEqual(mergeSettings({ visuals: { opacity: 150 } }).visuals.opacity, 100);
  assert.strictEqual(mergeSettings({ visuals: { opacity: -5 } }).visuals.opacity, 0);
});

test('applySettings applies partial over current values', () => {
  const base = mergeSettings({ display: { medals: false } });
  const next = applySettings(base, { visuals: { opacity: 50 } });
  assert.strictEqual(next.display.medals, false);
  assert.strictEqual(next.visuals.opacity, 50);
});

test('applySettings replaces theme overrides so cleared color is removed', () => {
  const base = applySettings(DEFAULT_SETTINGS, { theme: { overrides: { '--lb-bg': '#111111' } } });
  assert.strictEqual(base.theme.overrides['--lb-bg'], '#111111');
  const next = applySettings(base, { theme: { overrides: {} } });
  assert.deepStrictEqual(next.theme.overrides, {});
});

test('applySettings coerces non-boolean display toggles back to default', () => {
  const settings = applySettings(DEFAULT_SETTINGS, { display: { ranks: 'false' } });
  assert.strictEqual(settings.display.ranks, true);
});

test('applySettings keeps anonymous mask non-empty and trimmed', () => {
  assert.strictEqual(
    applySettings(DEFAULT_SETTINGS, { anonymousMaskName: '  Anonymous ' }).anonymousMaskName,
    'Anonymous'
  );
  assert.strictEqual(
    applySettings(DEFAULT_SETTINGS, { anonymousMaskName: '   ' }).anonymousMaskName,
    'Anonymous'
  );
});

test('applySettings drops theme overrides that are not CSS custom properties', () => {
  const overrides = JSON.parse('{"--lb-bg":"#123456","color":"red","__proto__":{"polluted":true}}');
  const settings = applySettings(DEFAULT_SETTINGS, { theme: { overrides } });
  assert.deepStrictEqual(settings.theme.overrides, { '--lb-bg': '#123456' });
});

test('themes resolve preset color', () => {
  assert.ok(/^#/.test(THEMES.midnight.background));
});

test('cssVars lets overrides win', () => {
  const vars = cssVars({ ...DEFAULT_SETTINGS, theme: { preset: 'midnight', overrides: { '--lb-accent': '#ff0000' } } });
  assert.strictEqual(vars['--lb-accent'], '#ff0000');
});

test('nextRotationWindow cycles and wraps', () => {
  assert.strictEqual(nextRotationWindow('this_stream'), '7d');
  assert.strictEqual(nextRotationWindow('alltime'), 'this_stream');
});

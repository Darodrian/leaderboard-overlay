import test from 'node:test';
import assert from 'node:assert/strict';
import { computePoints, shouldCredit } from '../js/points.js';

const cfg = { tip: 100, bit: 1, sub: 500, gift: 300, raid: 50 };

test('computePoints multiplies tip cents by per-cent rate', () => {
  assert.strictEqual(computePoints('tip', 1000, cfg), 1000);
});

test('computePoints multiplies bits by per-bit rate', () => {
  assert.strictEqual(computePoints('bit', 100, cfg), 100);
});

test('computePoints credits gift bundles by count', () => {
  assert.strictEqual(computePoints('gift', 5, cfg), 1500);
});

test('computePoints credits raids by raider count', () => {
  assert.strictEqual(computePoints('raid', 20, cfg), 1000);
});

test('computePoints never returns negative points', () => {
  assert.strictEqual(computePoints('tip', -50, cfg), 0);
});

test('computePoints treats missing rate as zero', () => {
  assert.strictEqual(computePoints('bit', 100, { tip: 100 }), 0);
});

test('computePoints treats non-numeric rate as zero', () => {
  assert.strictEqual(computePoints('raid', 5, { ...cfg, raid: 'x' }), 0);
});

test('shouldCredit ignores tips below threshold', () => {
  assert.strictEqual(shouldCredit('tip', 99, 100), false);
});

test('shouldCredit credits tips at threshold', () => {
  assert.strictEqual(shouldCredit('tip', 100, 100), true);
});

test('shouldCredit ignores zero tips', () => {
  assert.strictEqual(shouldCredit('tip', 0, 100), false);
});

test('shouldCredit always credits non-tip events', () => {
  assert.strictEqual(shouldCredit('bit', 0, 100), true);
});

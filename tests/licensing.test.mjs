import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canBindLicense,
  generateOpaqueToken,
  regenerateOverlayToken,
  tokenIsValid,
  encryptToken,
  decryptToken,
} from '../js/licensing.js';

test('canBindLicense binds unbound license', () => {
  assert.strictEqual(canBindLicense({ twitchUserId: null }, 'tw1'), true);
});

test('canBindLicense allows same owner', () => {
  assert.strictEqual(canBindLicense({ twitchUserId: 'tw1' }, 'tw1'), true);
});

test('canBindLicense rejects different owner', () => {
  assert.strictEqual(canBindLicense({ twitchUserId: 'tw1' }, 'tw2'), false);
});

test('generateOpaqueToken is url-safe and long enough', () => {
  const token = generateOpaqueToken();
  assert.ok(/^[A-Za-z0-9_-]+$/.test(token));
  assert.ok(token.length >= 40);
});

test('generateOpaqueToken is unique', () => {
  assert.notStrictEqual(generateOpaqueToken(), generateOpaqueToken());
});

test('tokenIsValid accepts active token', () => {
  assert.strictEqual(tokenIsValid({ token: 'abc', isActive: true }, 'abc'), true);
});

test('tokenIsValid rejects regenerated token', () => {
  assert.strictEqual(tokenIsValid({ token: 'new', isActive: true }, 'old'), false);
});

test('tokenIsValid rejects inactive sessions', () => {
  assert.strictEqual(tokenIsValid({ token: 'abc', isActive: false }, 'abc'), false);
});

test('regenerateOverlayToken creates new token', () => {
  const result = regenerateOverlayToken({ token: 'old', isActive: true }, 'new');
  assert.strictEqual(result.token, 'new');
  assert.strictEqual(result.previousToken, 'old');
  assert.strictEqual(tokenIsValid({ token: result.token, isActive: result.isActive }, 'old'), false);
  assert.strictEqual(tokenIsValid({ token: result.token, isActive: result.isActive }, 'new'), true);
});

test('encryptToken decryptToken round-trips', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  assert.strictEqual(decryptToken(encryptToken('secret', key), key), 'secret');
});

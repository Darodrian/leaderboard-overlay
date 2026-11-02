import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function canBindLicense(license, twitchUserId) {
  if (!license.twitchUserId) return true;
  return license.twitchUserId === twitchUserId;
}

export function generateOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function tokenIsValid(session, presented) {
  return session.isActive && presented.length > 0 && session.token === presented;
}

export function regenerateOverlayToken(current, newToken) {
  return {
    token: newToken,
    isActive: true,
    previousToken: current.token,
  };
}

function encryptionKey(keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return key;
}

export function encryptToken(plain, keyBase64) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(keyBase64), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptToken(cipherText, keyBase64) {
  const [ivPart, tagPart, dataPart] = cipherText.split('.');
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error('Malformed encrypted token');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(keyBase64),
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

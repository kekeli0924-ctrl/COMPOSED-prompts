import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM. Key is a 32-byte value provided base64 in CANVAS_TOKEN_KEY.
// Blob format: base64(iv) ':' base64(authTag) ':' base64(ciphertext).
function getKey(): Buffer {
  const b64 = process.env.CANVAS_TOKEN_KEY;
  if (!b64) throw new Error('CANVAS_TOKEN_KEY not configured');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('CANVAS_TOKEN_KEY must decode to 32 bytes');
  return key;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decryptToken(blob: string): string {
  const [ivB64, tagB64, ctB64] = blob.split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('malformed token blob');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

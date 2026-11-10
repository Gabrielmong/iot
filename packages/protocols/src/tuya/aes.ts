import { createCipheriv, createDecipheriv } from 'node:crypto';

const BLOCK = 16;

/** AES-128-ECB. With `pad`, applies PKCS#7 padding (Tuya always pads payloads). */
export function ecbEncrypt(key: Buffer, data: Buffer, pad = true): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(pad);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/**
 * AES-128-ECB decrypt, then strips PKCS#7 padding, checking every pad byte. Stricter than tinytuya
 * (which checks only the length byte) so a wrong key is detected reliably rather than ~1 time in 16.
 */
export function ecbDecrypt(key: Buffer, data: Buffer): Buffer {
  if (data.length % BLOCK !== 0) throw new Error(`ECB ciphertext length ${data.length} is not a multiple of ${BLOCK}`);
  const decipher = createDecipheriv('aes-128-ecb', key, null);
  decipher.setAutoPadding(false);
  const raw = Buffer.concat([decipher.update(data), decipher.final()]);
  const padLen = raw[raw.length - 1] ?? 0;
  if (padLen < 1 || padLen > BLOCK) throw new Error(`invalid ECB padding length ${padLen}`);
  const padding = raw.subarray(raw.length - padLen);
  if (!padding.every((b) => b === padLen)) throw new Error('invalid ECB padding bytes');
  return raw.subarray(0, raw.length - padLen);
}

/** AES-128-GCM encrypt with additional authenticated data; returns ciphertext and 16-byte tag. */
export function gcmEncrypt(key: Buffer, iv: Buffer, plaintext: Buffer, aad?: Buffer): { ciphertext: Buffer; tag: Buffer } {
  const cipher = createCipheriv('aes-128-gcm', key, iv);
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, tag: cipher.getAuthTag() };
}

/** AES-128-GCM decrypt; throws if the tag does not authenticate the ciphertext and AAD. */
export function gcmDecrypt(key: Buffer, iv: Buffer, ciphertext: Buffer, tag: Buffer, aad: Buffer): Buffer {
  const decipher = createDecipheriv('aes-128-gcm', key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

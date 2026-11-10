import { createHash } from 'node:crypto';
import { ecbDecrypt, ecbEncrypt } from './aes.js';
import { TuyaDecryptError } from './errors.js';

const MARKER = Buffer.from('3.1', 'latin1');
const SIG_LEN = 16;

function signature(key: Buffer, base64Body: Buffer): Buffer {
  const md5 = createHash('md5')
    .update(Buffer.concat([Buffer.from('data='), base64Body, Buffer.from('||lpv=3.1||'), key]))
    .digest('hex');
  return Buffer.from(md5.slice(8, 24), 'latin1');
}

/** 3.1 CONTROL body: "3.1" + md5 signature (16 hex chars) + base64(AES-ECB(payload)). */
export function seal31(key: Buffer, payload: Buffer): Buffer {
  const body = Buffer.from(ecbEncrypt(key, payload).toString('base64'), 'latin1');
  return Buffer.concat([MARKER, signature(key, body), body]);
}

/** True when a 3.1 body is a signed, encrypted one. */
export function isSealed31(body: Buffer): boolean {
  return body.subarray(0, MARKER.length).equals(MARKER);
}

/** Verifies the signature of a sealed 3.1 body and returns the decrypted payload. */
export function open31(key: Buffer, sealed: Buffer): Buffer {
  const sig = sealed.subarray(MARKER.length, MARKER.length + SIG_LEN);
  const body = sealed.subarray(MARKER.length + SIG_LEN);
  if (!sig.equals(signature(key, body))) throw new TuyaDecryptError('3.1 md5 signature mismatch');
  return ecbDecrypt(key, Buffer.from(body.toString('latin1'), 'base64'));
}

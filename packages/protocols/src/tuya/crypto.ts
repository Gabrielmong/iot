import { createHash } from 'node:crypto';
import { ecbEncrypt, gcmEncrypt } from './aes.js';

/** Key for Tuya UDP discovery broadcasts. */
export const udpKey: Buffer = createHash('md5').update('yGAdlopoPVldABfn').digest();

/**
 * Session key negotiated by the 3.4/3.5 handshake: the XOR of both nonces, encrypted with the
 * local key (3.4: AES-ECB, no padding; 3.5: AES-GCM with the first 12 bytes of the local nonce as IV).
 */
export function deriveSessionKey(version: '3.4' | '3.5', localKey: Buffer, localNonce: Buffer, remoteNonce: Buffer): Buffer {
  const mixed = Buffer.alloc(Math.min(localNonce.length, remoteNonce.length));
  for (let i = 0; i < mixed.length; i++) mixed[i] = localNonce[i]! ^ remoteNonce[i]!;
  if (version === '3.4') return ecbEncrypt(localKey, mixed, false);
  return gcmEncrypt(localKey, localNonce.subarray(0, 12), mixed).ciphertext;
}

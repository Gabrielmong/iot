import type { TuyaVersion } from '../types.js';
import { ecbDecrypt, ecbEncrypt } from './aes.js';
import { TuyaCmd } from './constants.js';
import { isSealed31, open31, seal31 } from './v31-signature.js';
import { addVersionHeader, stripVersionHeader } from './version-header.js';

/** Versions framed in 55AA envelopes. */
export type Version55AA = Exclude<TuyaVersion, '3.5'>;

/**
 * Turns a plaintext payload into the body of a 55AA frame:
 * 3.1 sends clear text except CONTROL (signed + encrypted); 3.3 encrypts, then prefixes the
 * version header in clear; 3.4 prefixes the version header, then encrypts.
 */
export function encodeBody(version: Version55AA, key: Buffer, cmd: number, payload: Buffer): Buffer {
  switch (version) {
    case '3.1':
      return cmd === TuyaCmd.CONTROL ? seal31(key, payload) : payload;
    case '3.3':
      return addVersionHeader(version, cmd, ecbEncrypt(key, payload));
    case '3.4':
      return ecbEncrypt(key, addVersionHeader(version, cmd, payload));
  }
}

/** Inverse of {@link encodeBody}. Empty bodies (bare acks) decode to an empty payload. */
export function decodeBody(version: Version55AA, key: Buffer, body: Buffer): Buffer {
  if (body.length === 0) return body;
  switch (version) {
    case '3.1':
      return isSealed31(body) ? open31(key, body) : body;
    case '3.3': {
      const ciphertext = stripVersionHeader(version, body);
      return ciphertext.length === 0 ? ciphertext : ecbDecrypt(key, ciphertext);
    }
    case '3.4':
      return stripVersionHeader(version, ecbDecrypt(key, body));
  }
}

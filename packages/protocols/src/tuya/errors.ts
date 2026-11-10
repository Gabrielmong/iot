/** A Tuya frame that is malformed or fails its integrity check (CRC, HMAC, GCM tag, 3.1 signature). */
export class TuyaFrameError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TuyaFrameError';
  }
}

/**
 * A frame that fails a key-dependent check: it cannot be decrypted or authenticated with the key in
 * use (3.4 HMAC, GCM tag, 3.1 signature, AES padding). This usually means a wrong key.
 */
export class TuyaDecryptError extends TuyaFrameError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TuyaDecryptError';
  }
}

import type { TuyaVersion } from '../types.js';
import { TuyaDecryptError } from './errors.js';

/** The device did not answer in time. */
export class TuyaTimeoutError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TuyaTimeoutError';
  }
}

/** The local key is wrong: the handshake failed to authenticate, or a reply could not be decrypted. */
export class TuyaKeyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TuyaKeyError';
  }
}

/** The connection is not open, or closed while a request was pending. */
export class TuyaDisconnectedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TuyaDisconnectedError';
  }
}

/** On 3.1/3.3 (no handshake), a reply that cannot be decrypted means a wrong key. */
export function keyErrorIfUndecryptable(version: TuyaVersion, err: unknown): unknown {
  if ((version === '3.1' || version === '3.3') && err instanceof TuyaDecryptError) {
    return new TuyaKeyError('device reply could not be decrypted; wrong local key?', { cause: err });
  }
  return err;
}

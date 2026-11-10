import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { awaitFrame } from './await-frame.js';
import { TuyaKeyError } from './client-errors.js';
import type { TuyaConnection } from './connection.js';
import { TuyaCmd } from './constants.js';
import { deriveSessionKey } from './crypto.js';
import { TuyaDecryptError, TuyaFrameError } from './errors.js';

const NONCE_LEN = 16;
const HMAC_LEN = 32;

/**
 * The 3.4/3.5 session-key negotiation, sent over `conn` (still keyed with the local key):
 * START carries our nonce; RESP carries the device nonce plus HMAC(localKey, our nonce), proving the
 * device holds our key; FINISH answers with HMAC(localKey, device nonce). Returns the session key.
 * Rejects with {@link TuyaKeyError} when RESP fails a key-dependent check (HMAC/GCM/decrypt) or its
 * proof does not match; other malformed replies stay {@link TuyaFrameError}.
 */
export async function negotiateSessionKey(
  conn: TuyaConnection,
  version: '3.4' | '3.5',
  localKey: Buffer,
  timeoutMs: number,
): Promise<Buffer> {
  const localNonce = randomBytes(NONCE_LEN);
  conn.send(TuyaCmd.SESS_KEY_NEG_START, localNonce);

  let resp: Buffer;
  try {
    resp = await awaitFrame(conn, (f) => (f.cmd === TuyaCmd.SESS_KEY_NEG_RESP ? f.payload : undefined), timeoutMs, 'handshake reply');
  } catch (err) {
    if (err instanceof TuyaDecryptError) throw new TuyaKeyError('handshake reply failed to authenticate; wrong local key?', { cause: err });
    throw err;
  }

  if (resp.length < NONCE_LEN + HMAC_LEN) throw new TuyaFrameError(`handshake reply too short (${resp.length} bytes)`);
  const remoteNonce = resp.subarray(0, NONCE_LEN);
  const proof = resp.subarray(NONCE_LEN, NONCE_LEN + HMAC_LEN);
  if (!timingSafeEqual(proof, hmac(localKey, localNonce))) {
    throw new TuyaKeyError('device did not prove knowledge of the local key; wrong local key?');
  }

  conn.send(TuyaCmd.SESS_KEY_NEG_FINISH, hmac(localKey, remoteNonce));
  return deriveSessionKey(version, localKey, localNonce, remoteNonce);
}

function hmac(key: Buffer, data: Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

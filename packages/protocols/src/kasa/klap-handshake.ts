import { randomBytes } from 'node:crypto';
import { KasaAuthError, KasaError } from './errors.js';
import { handshake2Hash, matchServerHash } from './klap-auth.js';
import { KlapCipher } from './klap-cipher.js';
import type { KasaCredentials } from './klap-default-credentials.js';
import { klapPost, type KlapPostOptions } from './klap-http.js';

const SESSION_COOKIE = 'TP_SESSIONID';
const TIMEOUT_COOKIE = 'TIMEOUT';
const ONE_DAY_SECONDS = 86400;
/** python-kasa expires sessions this long before the device's TIMEOUT, as device clocks drift. */
const SESSION_EXPIRE_BUFFER_SECONDS = 20 * 60;

/** An authenticated KLAP session: the cipher, the cookie to send, and when to re-handshake. */
export interface KlapSessionState {
  cipher: KlapCipher;
  cookie: string | undefined;
  /** `Date.now()` value after which the session must be renewed. */
  expiresAt: number;
}

/**
 * Runs handshake1 (send local seed, receive remote seed + server hash and the session cookie),
 * checks the server hash against the candidate credentials, then runs handshake2.
 */
export async function klapHandshake(
  appUrl: string,
  credentials: KasaCredentials,
  http: Omit<KlapPostOptions, 'cookie'>,
): Promise<KlapSessionState> {
  const localSeed = randomBytes(16);
  const h1 = await klapPost(`${appUrl}/handshake1`, localSeed, http);
  if (h1.status !== 200) throw new KasaError(`Device responded with ${h1.status} to handshake1`);
  if (h1.body.length !== 48) throw new KasaError(`Unexpected handshake1 response length ${h1.body.length}`);
  const remoteSeed = h1.body.subarray(0, 16);
  const match = matchServerHash(localSeed, remoteSeed, h1.body.subarray(16), credentials);
  if (!match) throw new KasaAuthError('Device did not accept the credentials; check the TP-Link e-mail and password');

  const sessionId = h1.cookies.get(SESSION_COOKIE);
  const cookie = sessionId === undefined ? undefined : `${SESSION_COOKIE}=${sessionId}`;
  const timeoutSeconds = Number(h1.cookies.get(TIMEOUT_COOKIE)) || ONE_DAY_SECONDS;
  const expiresAt = Date.now() + (timeoutSeconds - SESSION_EXPIRE_BUFFER_SECONDS) * 1000;

  const proof = handshake2Hash(match.variant, localSeed, remoteSeed, match.authHash);
  const h2 = await klapPost(`${appUrl}/handshake2`, proof, { ...http, cookie });
  // Credentials were already verified in handshake1, so this is not an auth error (as python-kasa).
  if (h2.status !== 200) throw new KasaError(`Device responded with ${h2.status} to handshake2`);

  return { cipher: new KlapCipher(localSeed, remoteSeed, match.authHash), cookie, expiresAt };
}

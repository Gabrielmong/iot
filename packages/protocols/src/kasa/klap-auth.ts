import { createHash } from 'node:crypto';
import { BLANK_CREDENTIALS, DEFAULT_CREDENTIALS, type KasaCredentials } from './klap-default-credentials.js';

/** `v1` is python-kasa `KlapTransport` (md5 auth hash); `v2` is `KlapTransportV2` (sha1/sha256). */
export type KlapVariant = 'v1' | 'v2';

const digest = (alg: string, ...parts: Buffer[]) => createHash(alg).update(Buffer.concat(parts)).digest();
const utf8 = (s: string) => Buffer.from(s, 'utf8');

export function authHash(variant: KlapVariant, username: string, password: string): Buffer {
  return variant === 'v2'
    ? digest('sha256', digest('sha1', utf8(username)), digest('sha1', utf8(password)))
    : digest('md5', digest('md5', utf8(username)), digest('md5', utf8(password)));
}

/** The hash a device appends to its handshake1 reply, proving it knows the auth hash. */
export function handshake1Hash(variant: KlapVariant, localSeed: Buffer, remoteSeed: Buffer, auth: Buffer): Buffer {
  return variant === 'v2' ? digest('sha256', localSeed, remoteSeed, auth) : digest('sha256', localSeed, auth);
}

/** The handshake2 request body, proving the client knows the auth hash. */
export function handshake2Hash(variant: KlapVariant, localSeed: Buffer, remoteSeed: Buffer, auth: Buffer): Buffer {
  return variant === 'v2' ? digest('sha256', remoteSeed, localSeed, auth) : digest('sha256', remoteSeed, auth);
}

export interface KlapAuthMatch {
  variant: KlapVariant;
  authHash: Buffer;
}

const VARIANTS: readonly KlapVariant[] = ['v2', 'v1'];

/**
 * Finds the credentials and variant behind a device's handshake1 server hash, in python-kasa's
 * order: the user's credentials, then the hardcoded default credentials, then blank ones. Each is
 * tried as v2 first, then v1. Returns undefined when none match (wrong password).
 */
export function matchServerHash(
  localSeed: Buffer,
  remoteSeed: Buffer,
  serverHash: Buffer,
  user: KasaCredentials,
): KlapAuthMatch | undefined {
  for (const creds of [user, ...DEFAULT_CREDENTIALS, BLANK_CREDENTIALS]) {
    for (const variant of VARIANTS) {
      const auth = authHash(variant, creds.username, creds.password);
      if (handshake1Hash(variant, localSeed, remoteSeed, auth).equals(serverHash)) return { variant, authHash: auth };
    }
  }
  return undefined;
}

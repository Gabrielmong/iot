import { randomBytes } from 'node:crypto';
import { digestResponse } from './digest.js';
import type { AuthChallenge } from './www-authenticate.js';

export interface RtspCredentials {
  username: string;
  password: string;
}

/**
 * Builds the Authorization header answering the server's challenges: Digest (MD5) when offered,
 * otherwise Basic only when `allowBasic` (it sends the password in cleartext). Returns undefined when no
 * acceptable challenge was offered, in which case no credentials must be sent.
 */
export function authorizationFor(
  challenges: readonly AuthChallenge[],
  creds: RtspCredentials,
  method: string,
  uri: string,
  allowBasic = false,
): string | undefined {
  const digest = challenges.find((c) => c.scheme === 'digest' && isMd5(c.params.algorithm) && c.params.nonce !== undefined);
  if (digest) return digestHeader(digest.params, creds, method, uri);
  if (allowBasic && challenges.some((c) => c.scheme === 'basic')) {
    return `Basic ${Buffer.from(`${creds.username}:${creds.password}`, 'utf8').toString('base64')}`;
  }
  return undefined;
}

function digestHeader(params: Record<string, string>, creds: RtspCredentials, method: string, uri: string): string {
  const realm = params.realm ?? '';
  const nonce = params.nonce ?? '';
  const offersAuth = params.qop?.split(',').some((q) => q.trim().toLowerCase() === 'auth') ?? false;
  const qop = offersAuth ? { nc: '00000001', cnonce: randomBytes(8).toString('hex') } : undefined;
  const response = digestResponse({ ...creds, realm, nonce, method, uri, qop });

  const parts = [`username=${quote(creds.username)}`, `realm=${quote(realm)}`, `nonce=${quote(nonce)}`, `uri=${quote(uri)}`, `response="${response}"`];
  if (params.algorithm) parts.push(`algorithm=${params.algorithm}`);
  if (params.opaque !== undefined) parts.push(`opaque=${quote(params.opaque)}`);
  if (qop) parts.push(`qop=auth, nc=${qop.nc}, cnonce="${qop.cnonce}"`);
  return `Digest ${parts.join(', ')}`;
}

function isMd5(algorithm: string | undefined): boolean {
  return algorithm === undefined || algorithm.toUpperCase() === 'MD5';
}

function quote(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&').replace(/[\r\n]/g, '')}"`;
}

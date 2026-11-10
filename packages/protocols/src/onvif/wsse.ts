import { createHash, randomBytes } from 'node:crypto';
import type { RtspCredentials } from '../digest-auth/authorization.js';
import { escapeXml } from './xml.js';

const WSSE_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const WSU_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const PASSWORD_DIGEST = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest';
const BASE64_BINARY = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';

/** WS-Security UsernameToken PasswordDigest: Base64(SHA-1(nonce + created + password)). */
export function passwordDigest(nonce: Buffer, created: string, password: string): string {
  return createHash('sha1')
    .update(Buffer.concat([nonce, Buffer.from(created, 'utf8'), Buffer.from(password, 'utf8')]))
    .digest('base64');
}

/**
 * The SOAP `wsse:Security` header with a PasswordDigest UsernameToken. `created` should be on the
 * camera's clock (cameras reject a Created too far from their own time). Only the digest is sent,
 * never the password (no PasswordText).
 */
export function wsSecurityHeader(creds: RtspCredentials, created: Date, nonce: Buffer = randomBytes(16)): string {
  const when = created.toISOString().replace(/\.\d+Z$/, 'Z');
  return (
    `<wsse:Security xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}"><wsse:UsernameToken>` +
    `<wsse:Username>${escapeXml(creds.username)}</wsse:Username>` +
    `<wsse:Password Type="${PASSWORD_DIGEST}">${passwordDigest(nonce, when, creds.password)}</wsse:Password>` +
    `<wsse:Nonce EncodingType="${BASE64_BINARY}">${nonce.toString('base64')}</wsse:Nonce>` +
    `<wsu:Created>${when}</wsu:Created>` +
    '</wsse:UsernameToken></wsse:Security>'
  );
}

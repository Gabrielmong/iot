import { createHash, createHmac } from 'node:crypto';

export type SignInput = {
  accessId: string;
  accessSecret: string;
  /** Empty for the token request itself. */
  accessToken: string;
  /** Millisecond timestamp, as a string. */
  t: string;
  nonce: string;
  method: string;
  /** Path including the (key-sorted) query string, exactly as sent. */
  path: string;
  body: string;
};

/**
 * Tuya OpenAPI "new" signature: HMAC-SHA256(accessId + token + t + nonce + stringToSign, secret),
 * upper-case hex; stringToSign = METHOD \n sha256(body) \n (signed headers, none) \n path.
 * Matches tinytuya's Cloud._tuyaplatform().
 */
export function signCloudRequest(input: SignInput): string {
  const bodyHash = createHash('sha256').update(input.body).digest('hex');
  const stringToSign = [input.method, bodyHash, '', input.path].join('\n');
  const payload = input.accessId + input.accessToken + input.t + input.nonce + stringToSign;
  return createHmac('sha256', input.accessSecret).update(payload).digest('hex').toUpperCase();
}

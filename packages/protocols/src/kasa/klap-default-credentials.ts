/**
 * python-kasa's `DEFAULT_CREDENTIALS` (base64 there too). Devices sometimes answer handshake1 with
 * one of these instead of the owner's cloud account, so python-kasa accepts them as a fallback.
 */
const ENCODED: readonly (readonly [string, string])[] = [
  ['a2FzYUB0cC1saW5rLm5ldA==', 'a2FzYVNldHVw'], // KASA
  ['YWRtaW4=', 'MjEyMzJmMjk3YTU3YTVhNzQzODk0YTBlNGE4MDFmYzM='], // KASACAMERA
  ['dGVzdEB0cC1saW5rLm5ldA==', 'dGVzdA=='], // TAPO
  ['YWRtaW4=', 'YWRtaW4='], // TAPOCAMERA
  ['YWRtaW4=', 'VFBMMDc1NTI2NDYwNjAz'], // TAPOCAMERA_LV3
];

export interface KasaCredentials {
  username: string;
  password: string;
}

const decode = (s: string) => Buffer.from(s, 'base64').toString('utf8');

export const DEFAULT_CREDENTIALS: readonly KasaCredentials[] = ENCODED.map(([u, p]) => ({ username: decode(u), password: decode(p) }));

export const BLANK_CREDENTIALS: KasaCredentials = { username: '', password: '' };

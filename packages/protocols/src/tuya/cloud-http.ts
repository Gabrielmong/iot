import { cloudErrorFor, TUYA_TOKEN_INVALID_CODE, TuyaCloudError } from './cloud-errors.js';
import { signCloudRequest } from './cloud-sign.js';

export type CloudHttpOptions = {
  accessId: string;
  accessSecret: string;
  host: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type Method = 'GET' | 'POST';
type TuyaReply = { success?: boolean; code?: number; msg?: string; result?: unknown };

const TOKEN_PATH = '/v1.0/token?grant_type=1';
/** Refresh slightly before Tuya's stated expiry. */
const EXPIRY_MARGIN_MS = 60_000;

/** Signed requests against the Tuya OpenAPI, with a cached access token (endpoints per tinytuya's Cloud class). */
export class CloudHttp {
  private token?: { value: string; expiresAt: number };
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly opts: CloudHttpOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  /** GET `path` (query already key-sorted) and return the reply's `result`. */
  get<T>(path: string): Promise<T> {
    return this.call<T>('GET', path, '');
  }

  /** POST `body` as JSON to `path` and return the reply's `result`. */
  post<T>(path: string, body: unknown): Promise<T> {
    return this.call<T>('POST', path, JSON.stringify(body));
  }

  private async call<T>(method: Method, path: string, body: string): Promise<T> {
    const first = await this.signed(method, path, body, await this.accessToken());
    if (first.code !== TUYA_TOKEN_INVALID_CODE) return this.unwrap<T>(first);
    this.token = undefined;
    return this.unwrap<T>(await this.signed(method, path, body, await this.accessToken()));
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt) return this.token.value;
    const reply = await this.signed('GET', TOKEN_PATH, '', '');
    const result = this.unwrap<{ access_token: string; expire_time: number }>(reply);
    this.token = { value: result.access_token, expiresAt: this.now() + result.expire_time * 1000 - EXPIRY_MARGIN_MS };
    return result.access_token;
  }

  private async signed(method: Method, path: string, body: string, accessToken: string): Promise<TuyaReply> {
    const t = String(this.now());
    const sign = signCloudRequest({
      accessId: this.opts.accessId,
      accessSecret: this.opts.accessSecret,
      accessToken,
      t,
      nonce: '',
      method,
      path,
      body,
    });
    const headers: Record<string, string> = { client_id: this.opts.accessId, sign, t, sign_method: 'HMAC-SHA256' };
    if (accessToken) headers.access_token = accessToken;
    if (body) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await this.fetchImpl(`https://${this.opts.host}${path}`, { method, headers, ...(body ? { body } : {}) });
    } catch (err) {
      throw new TuyaCloudError('Tuya cloud unreachable', { cause: err });
    }
    try {
      return (await res.json()) as TuyaReply;
    } catch (err) {
      throw new TuyaCloudError(`Tuya cloud returned a non-JSON reply (HTTP ${res.status})`, { cause: err });
    }
  }

  private unwrap<T>(reply: TuyaReply): T {
    if (!reply.success) throw cloudErrorFor(reply.code, reply.msg);
    return reply.result as T;
  }
}

import { RequestQueue } from '../request-queue.js';
import { KasaError } from './errors.js';
import { klapHandshake, type KlapSessionState } from './klap-handshake.js';
import { klapPost, type KlapHttpPost, type KlapPostOptions } from './klap-http.js';

export interface KlapSessionOptions {
  ip: string;
  username: string;
  password: string;
  /** HTTP port; KLAP devices listen on 80. */
  port?: number;
  /** Per HTTP request. Defaults to 5000 ms (python-kasa's default). */
  timeoutMs?: number;
  /** Injectable HTTP transport for tests; defaults to node:http (see klap-http.ts for why not fetch). */
  httpPost?: KlapHttpPost;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * A KLAP connection to one device (python-kasa `KlapTransport`/`KlapTransportV2`). Handshakes
 * lazily, and again when the session nears its TIMEOUT or the device answers 403. Requests run
 * one at a time, since each one consumes the next seq.
 */
export class KlapSession {
  readonly #appUrl: string;
  readonly #credentials: { username: string; password: string };
  readonly #http: Omit<KlapPostOptions, 'cookie'>;
  readonly #queue = new RequestQueue();
  #state: (KlapSessionState & { seq: number }) | undefined;

  constructor(opts: KlapSessionOptions) {
    this.#appUrl = `http://${opts.ip}:${opts.port ?? 80}/app`;
    this.#credentials = { username: opts.username, password: opts.password };
    this.#http = { httpPost: opts.httpPost, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS };
  }

  request<T>(json: object): Promise<T> {
    return this.#queue.run(() => this.#send<T>(json, true));
  }

  async #send<T>(json: object, mayRetry: boolean): Promise<T> {
    try {
      return await this.#exchange<T>(json);
    } catch (err) {
      // Any failure may leave the device and us out of step (as python-kasa's IotProtocol, which
      // resets the transport on every error): start the next request with a fresh handshake.
      this.#state = undefined;
      // The device dropped the session (reboot, expiry, another client): handshake again once.
      if (mayRetry && err instanceof SessionRejectedError) return this.#send<T>(json, false);
      throw err;
    }
  }

  async #exchange<T>(json: object): Promise<T> {
    const state = await this.#session();
    // python-kasa lets seq grow unbounded and would fail to pack it past int32; wrap instead.
    const seq = (state.seq = (state.seq + 1) | 0);
    const body = state.cipher.encrypt(Buffer.from(JSON.stringify(json), 'utf8'), seq);
    const res = await klapPost(`${this.#appUrl}/request?seq=${seq}`, body, { ...this.#http, cookie: state.cookie });

    if (res.status === 403) throw new SessionRejectedError(`Device responded with 403 to request seq ${seq}`);
    if (res.status !== 200) throw new KasaError(`Device responded with ${res.status} to request seq ${seq}`);
    try {
      return JSON.parse(state.cipher.decrypt(res.body, seq).toString('utf8')) as T;
    } catch (err) {
      throw new KasaError(`Could not decrypt the device response: ${(err as Error).message}`, { cause: err });
    }
  }

  async #session(): Promise<KlapSessionState & { seq: number }> {
    if (!this.#state || Date.now() >= this.#state.expiresAt) {
      this.#state = undefined;
      const state = await klapHandshake(this.#appUrl, this.#credentials, this.#http);
      this.#state = { ...state, seq: state.cipher.initialSeq };
    }
    return this.#state;
  }
}

/** A 403 on a request: the device no longer recognises the session. */
class SessionRejectedError extends KasaError {}

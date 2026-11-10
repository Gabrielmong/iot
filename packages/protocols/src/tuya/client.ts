import { EventEmitter } from 'node:events';
import type { TuyaVersion } from '../types.js';
import { awaitFrame } from './await-frame.js';
import { keyErrorIfUndecryptable, TuyaDisconnectedError, TuyaKeyError, TuyaTimeoutError } from './client-errors.js';
import { TuyaConnection } from './connection.js';
import { TuyaCmd } from './constants.js';
import type { TuyaFrame } from './frame.js';
import { negotiateSessionKey } from './handshake.js';
import { Heartbeat } from './heartbeat.js';
import { commandsFor, controlPayload, heartbeatPayload, queryPayload } from './payloads.js';
import { controlAckMatcher, queryReplyMatcher, tryExtractDps, type ReplyMatcher } from './reply-matchers.js';
import { RequestQueue } from '../request-queue.js';

export { TuyaDisconnectedError, TuyaKeyError, TuyaTimeoutError } from './client-errors.js';

export interface TuyaClientOptions {
  ip: string;
  id: string;
  /** The device's 16-character local key. */
  localKey: string;
  version: TuyaVersion;
  /** Per-request (and connect/handshake) timeout. Default 5000 ms. */
  timeoutMs?: number;
  /** TCP port. Default 6668; tests point it at a fake device. */
  port?: number;
  /** Default 10 000 ms. */
  heartbeatIntervalMs?: number;
}

export interface TuyaClientEvents {
  /** dps pushed by the device (usually a partial set). */
  dps: [Record<string, unknown>];
  /** The connection was lost (not emitted for {@link TuyaClient.close}). */
  disconnected: [];
  /**
   * The connection is unusable (undecodable frame, or a reply showing a wrong key); 'disconnected'
   * follows. Attach a listener: unhandled 'error' events throw.
   */
  error: [Error];
}

const DEFAULT_PORT = 6668;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_HEARTBEAT_MS = 10_000;
const LOCAL_KEY_LEN = 16;

/** A persistent LAN connection to one Tuya device (protocol 3.1, 3.3, 3.4 or 3.5). */
export class TuyaClient extends EventEmitter<TuyaClientEvents> {
  private conn: TuyaConnection | undefined;
  /** The connection while connect() is still opening it or negotiating its session key. */
  private opening: TuyaConnection | undefined;
  private connecting = false;
  /** Bumped by close(), so a connect() in flight can tell it was cancelled. */
  private generation = 0;
  private readonly localKey: Buffer;
  private readonly timeoutMs: number;
  private readonly cmds: { query: number; control: number };
  /** Tuya devices do not reliably echo seq numbers, so replies are matched by command: one request in flight. */
  private readonly queue = new RequestQueue();
  private readonly heartbeat: Heartbeat;

  constructor(private readonly opts: TuyaClientOptions) {
    super();
    this.localKey = Buffer.from(opts.localKey, 'utf8');
    if (this.localKey.length !== LOCAL_KEY_LEN) throw new RangeError(`Tuya local key must be ${LOCAL_KEY_LEN} bytes`);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cmds = commandsFor(opts.version);
    this.heartbeat = new Heartbeat({
      intervalMs: opts.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS,
      replyTimeoutMs: this.timeoutMs,
      send: () => this.conn?.send(TuyaCmd.HEART_BEAT, heartbeatPayload(opts.id)),
      onMissed: () => this.conn?.close(),
    });
  }

  /**
   * Opens the connection and, on 3.4/3.5, negotiates the session key. Rejects with
   * {@link TuyaDisconnectedError} if {@link close} is called before it finishes.
   */
  async connect(): Promise<void> {
    if (this.conn || this.connecting) throw new Error('TuyaClient is already connected or connecting');
    this.connecting = true;
    const generation = this.generation;
    try {
      const { ip, version } = this.opts;
      const conn = await TuyaConnection.open(ip, this.opts.port ?? DEFAULT_PORT, version, this.localKey, this.timeoutMs);
      this.opening = conn;
      try {
        this.throwIfCancelled(generation);
        if (version === '3.4' || version === '3.5') {
          conn.setKey(await negotiateSessionKey(conn, version, this.localKey, this.timeoutMs));
        }
        this.throwIfCancelled(generation);
      } catch (err) {
        conn.close();
        throw generation === this.generation ? err : new TuyaDisconnectedError('closed during connect', { cause: err });
      }
      this.attach(conn);
    } finally {
      this.opening = undefined;
      this.connecting = false;
    }
  }

  getDps(): Promise<Record<string, unknown>> {
    const payload = queryPayload(this.opts.version, this.opts.id, now());
    return this.request(this.cmds.query, payload, 'dps reply', (seq) => queryReplyMatcher(this.opts.version, this.cmds.query, seq));
  }

  async setDps(dps: Record<string, unknown>): Promise<void> {
    const payload = controlPayload(this.opts.version, this.opts.id, dps, now());
    await this.request(this.cmds.control, payload, 'control ack', (seq) => controlAckMatcher(this.opts.version, this.cmds.control, seq));
  }

  /** Closes the connection (or cancels a connect in progress) without emitting 'disconnected'. Pending requests reject. */
  close(): void {
    this.generation++;
    const conn = this.conn;
    this.conn = undefined;
    this.heartbeat.stop();
    conn?.close();
    this.opening?.close();
  }

  private throwIfCancelled(generation: number): void {
    if (generation !== this.generation) throw new TuyaDisconnectedError('closed during connect');
  }

  private attach(conn: TuyaConnection): void {
    conn.on('frame', (f) => this.onFrame(f));
    conn.on('frameError', (err) => this.emit('error', keyErrorIfUndecryptable(this.opts.version, err) as Error));
    conn.on('close', () => {
      if (conn !== this.conn) return; // closed deliberately
      this.conn = undefined;
      this.heartbeat.stop();
      this.emit('disconnected');
    });
    this.conn = conn;
    this.heartbeat.start();
  }

  /** Sends one request (after any earlier ones finish) and waits for the reply `matcherFor(seq)` accepts. */
  private request<T>(cmd: number, payload: Buffer, what: string, matcherFor: (seq: number) => ReplyMatcher<T>): Promise<T> {
    return this.queue.run(async () => {
      const conn = this.conn;
      if (!conn) throw new TuyaDisconnectedError('not connected');
      const seq = conn.send(cmd, payload);
      try {
        return await awaitFrame(conn, matcherFor(seq), this.timeoutMs, what);
      } catch (err) {
        this.afterRequestFailure(conn, err);
        throw keyErrorIfUndecryptable(this.opts.version, err);
      }
    });
  }

  /**
   * A reply proving a wrong key makes the connection useless: report it and drop it (stream decrypt
   * failures have already done both). On 3.5 a timed-out request's late reply could not be told apart
   * from the next request's, so the connection is dropped as well.
   */
  private afterRequestFailure(conn: TuyaConnection, err: unknown): void {
    if (conn.isClosed) return;
    if (err instanceof TuyaKeyError) {
      this.emit('error', err);
      conn.close();
    } else if (err instanceof TuyaTimeoutError && this.opts.version === '3.5') {
      conn.close();
    }
  }

  private onFrame(f: TuyaFrame): void {
    if (f.cmd === TuyaCmd.HEART_BEAT) this.heartbeat.ack();
    if (f.cmd !== TuyaCmd.STATUS) return;
    const dps = tryExtractDps(f.payload);
    if (dps) this.emit('dps', dps);
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { connectPinned } from '../net/pinned-tls.js';
import { SamsungPairingTimeoutError, SamsungUnauthorizedError } from './errors.js';

export const SAMSUNG_REMOTE_PORT = 8002;
/** How the app appears in the TV's prompt and device list. */
const CLIENT_NAME = 'Home Control';
const PAIRING_WAIT_MS = 30_000;
const MAX_MESSAGE_BYTES = 64 * 1024;

export interface SamsungChannelOptions {
  port?: number;
  /** Connect + channel handshake. Default 2.5 s (below the 3 s command timeout). */
  timeoutMs?: number;
}

export interface SamsungPaired {
  token: string;
  tvCertSha256: string;
}

type ChannelEvent = { event?: string; data?: { token?: string } };

/**
 * Opens the remote-control WebSocket over a TLS socket already checked against the pin, so the token in
 * the URL never reaches another device.
 */
async function openChannel(host: string, token: string | undefined, pinSha256: string | undefined, opts: SamsungChannelOptions): Promise<{ ws: WebSocket; certSha256: string }> {
  const port = opts.port ?? SAMSUNG_REMOTE_PORT;
  const timeoutMs = opts.timeoutMs ?? 2500;
  const { socket, certSha256 } = await connectPinned(host, port, { pinSha256, timeoutMs });
  const query = new URLSearchParams({ name: Buffer.from(CLIENT_NAME).toString('base64') });
  if (token) query.set('token', token);
  const ws = new WebSocket(`wss://${host}:${port}/api/v2/channels/samsung.remote.control?${query}`, {
    createConnection: () => socket,
    maxPayload: MAX_MESSAGE_BYTES,
    handshakeTimeout: timeoutMs,
  });
  ws.on('error', () => undefined); // surfaced through the waits below and 'close'
  return { ws, certSha256 };
}

/** Waits for ms.channel.connect (resolving with its token, if any) or ms.channel.unauthorized. */
function waitForConnect(ws: WebSocket, timeoutMs: number, onTimeout: () => Error): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const done = (err?: Error, token?: string) => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('close', onClose);
      if (err) {
        ws.terminate();
        reject(err);
      } else resolve(token);
    };
    const onMessage = (raw: WebSocket.RawData) => {
      let m: ChannelEvent;
      try {
        m = JSON.parse(raw.toString()) as ChannelEvent;
      } catch {
        return;
      }
      if (m.event === 'ms.channel.connect') done(undefined, m.data?.token);
      else if (m.event === 'ms.channel.unauthorized') done(new SamsungUnauthorizedError());
      else if (m.event === 'ms.channel.timeOut') done(onTimeout());
    };
    const onClose = () => done(new Error('The TV closed the connection'));
    const timer = setTimeout(() => done(onTimeout()), timeoutMs);
    ws.on('message', onMessage);
    ws.on('close', onClose);
  });
}

/**
 * Pairing: connecting without a token makes the TV ask "Allow Home Control?". The answer is listened for
 * from the moment the channel opens (a TV that already allows the app answers at once); `finish` waits up
 * to 30 s from `start` for it and resolves with the token issued and the TV's certificate fingerprint.
 */
export class SamsungPairing {
  private readonly answer: Promise<string | undefined>;

  private constructor(
    private readonly ws: WebSocket,
    private readonly certSha256: string,
    waitMs: number,
  ) {
    this.answer = waitForConnect(ws, waitMs, () => new SamsungPairingTimeoutError());
    this.answer.catch(() => undefined); // read by finish(); unhandled until then
  }

  static async start(host: string, opts: SamsungChannelOptions & { waitMs?: number } = {}): Promise<SamsungPairing> {
    const { ws, certSha256 } = await openChannel(host, undefined, undefined, { timeoutMs: 5000, ...opts });
    return new SamsungPairing(ws, certSha256, opts.waitMs ?? PAIRING_WAIT_MS);
  }

  async finish(): Promise<SamsungPaired> {
    try {
      const token = await this.answer;
      if (!token) throw new SamsungUnauthorizedError(); // TVs without token auth can't be paired this way
      return { token, tvCertSha256: this.certSha256 };
    } finally {
      this.cancel();
    }
  }

  cancel(): void {
    this.ws.terminate();
  }
}

/** A connected remote-control channel. Emits `disconnected` once when it ends. */
export class SamsungRemote extends EventEmitter {
  private open = true;

  private constructor(private readonly ws: WebSocket) {
    super();
    ws.on('close', () => {
      if (!this.open) return;
      this.open = false;
      this.emit('disconnected');
    });
  }

  /** Rejects with SamsungUnauthorizedError (token refused) or CertificateMismatchError (another TV). */
  static async connect(host: string, paired: SamsungPaired, opts: SamsungChannelOptions = {}): Promise<SamsungRemote> {
    const { ws } = await openChannel(host, paired.token, paired.tvCertSha256, opts);
    await waitForConnect(ws, opts.timeoutMs ?? 2500, () => new Error('The TV did not answer'));
    return new SamsungRemote(ws);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Presses a key once (e.g. KEY_VOLUP). Throws when the channel is closed. */
  sendKey(key: string): void {
    this.send({ method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' } });
  }

  /** Opens an app by its Tizen app ID. */
  launch(appId: string): void {
    this.send({ method: 'ms.channel.emit', params: { event: 'ed.apps.launch', to: 'host', data: { appId, action_type: 'DEEP_LINK' } } });
  }

  close(): void {
    this.open = false;
    this.ws.terminate();
  }

  private send(message: object): void {
    if (!this.open || this.ws.readyState !== WebSocket.OPEN) throw new Error('Not connected to the TV');
    this.ws.send(JSON.stringify(message));
  }
}

import tls from 'node:tls';
import type { ClientCertificate } from './certificate.js';
import { certSha256 } from './certificate.js';
import { AndroidTvBadCodeError, AndroidTvPairingFailedError } from './errors.js';
import {
  ENCODING_TYPE_HEXADECIMAL,
  FrameReader,
  PAIRING_PROTOCOL_VERSION,
  PAIRING_STATUS_BAD_SECRET,
  PAIRING_STATUS_OK,
  ROLE_TYPE_INPUT,
  decodePairing,
  encodePairing,
  type PairingMessage,
} from './messages.js';
import { pairingSecret } from './pairing-secret.js';

export const ANDROID_TV_PAIRING_PORT = 6467;
const CODE_ENCODING = { type: ENCODING_TYPE_HEXADECIMAL, symbolLength: 6 };

export interface AndroidTvPairingOptions {
  port?: number;
  /** For each step of the exchange. Default 10 s. */
  timeoutMs?: number;
  /** Shown on the TV's paired-devices list. */
  clientName?: string;
}

export interface AndroidTvPairingResult {
  /** SHA-256 of the TV's certificate, pinned on every later remote connection. */
  tvCertSha256: string;
}

type Waiter = { match: (m: PairingMessage) => boolean; resolve: (m: PairingMessage) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

/**
 * One pairing exchange (port 6467): `start` makes the TV show a 6-character code, `finish(code)` sends
 * the secret derived from it. Nothing is trusted yet at this point (there is no pin to check); the code
 * typed from the TV's screen is what binds this client to that TV's certificate.
 */
export class AndroidTvPairing {
  private readonly frames = new FrameReader();
  private waiter: Waiter | undefined;
  private failure: Error | undefined;

  private constructor(
    private readonly socket: tls.TLSSocket,
    private readonly cert: ClientCertificate,
    private readonly timeoutMs: number,
  ) {
    socket.on('data', (chunk: Buffer) => {
      try {
        for (const body of this.frames.push(chunk)) this.onMessage(decodePairing(body));
      } catch (err) {
        this.fail(new AndroidTvPairingFailedError(`Bad message from TV: ${(err as Error).message}`));
      }
    });
    socket.on('error', (err) => this.fail(new AndroidTvPairingFailedError(err.message)));
    socket.on('close', () => this.fail(new AndroidTvPairingFailedError('The TV closed the pairing connection')));
  }

  /** Connects and runs the exchange up to the TV showing its code. */
  static async start(host: string, cert: ClientCertificate, opts: AndroidTvPairingOptions = {}): Promise<AndroidTvPairing> {
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const socket = await connect(host, opts.port ?? ANDROID_TV_PAIRING_PORT, cert, timeoutMs);
    const pairing = new AndroidTvPairing(socket, cert, timeoutMs);
    try {
      await pairing.request({ pairingRequest: { serviceName: 'home-control', clientName: opts.clientName ?? 'Home control' } }, (m) => !!m.pairingRequestAck);
      await pairing.request({ pairingOption: { inputEncodings: [CODE_ENCODING], preferredRole: ROLE_TYPE_INPUT } }, (m) => !!m.pairingOption);
      await pairing.request({ pairingConfiguration: { encoding: CODE_ENCODING, clientRole: ROLE_TYPE_INPUT } }, (m) => !!m.pairingConfigurationAck);
    } catch (err) {
      pairing.cancel();
      throw err;
    }
    return pairing;
  }

  /** Sends the secret for `code`. A mistyped code throws AndroidTvBadCodeError and leaves the exchange open. */
  async finish(code: string): Promise<AndroidTvPairingResult> {
    const serverDer = this.socket.getPeerCertificate().raw;
    const secret = pairingSecret(this.cert.certPem, serverDer, code.trim());
    if (!secret) throw new AndroidTvBadCodeError();
    try {
      await this.request({ pairingSecret: { secret } }, (m) => !!m.pairingSecretAck);
    } finally {
      this.cancel();
    }
    return { tvCertSha256: certSha256(serverDer) };
  }

  cancel(): void {
    this.failure ??= new AndroidTvPairingFailedError('Pairing cancelled');
    this.socket.destroy();
  }

  private request(payload: PairingMessage, match: (m: PairingMessage) => boolean): Promise<PairingMessage> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new AndroidTvPairingFailedError('The TV did not answer')), this.timeoutMs);
      this.waiter = { match, resolve, reject, timer };
      this.socket.write(encodePairing({ protocolVersion: PAIRING_PROTOCOL_VERSION, status: PAIRING_STATUS_OK, ...payload }));
    });
  }

  private onMessage(m: PairingMessage): void {
    if (m.status !== PAIRING_STATUS_OK) {
      // A bad secret means the TV computed a different hash: the code passed our check byte but not theirs.
      if (m.status === PAIRING_STATUS_BAD_SECRET) return this.fail(new AndroidTvBadCodeError());
      return this.fail(new AndroidTvPairingFailedError(`The TV answered status ${m.status ?? 'none'}`));
    }
    const waiter = this.waiter;
    if (!waiter || !waiter.match(m)) return;
    this.waiter = undefined;
    clearTimeout(waiter.timer);
    waiter.resolve(m);
  }

  private fail(err: Error): void {
    this.failure ??= err;
    const waiter = this.waiter;
    this.waiter = undefined;
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.reject(err);
    }
    this.socket.destroy();
  }
}

function connect(host: string, port: number, cert: ClientCertificate, timeoutMs: number): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    // No pin exists before pairing; the TV's certificate is captured here and pinned afterwards.
    const socket = tls.connect({ host, port, cert: cert.certPem, key: cert.keyPem, rejectUnauthorized: false });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new AndroidTvPairingFailedError('The TV did not answer'));
    }, timeoutMs);
    socket.once('secureConnect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(new AndroidTvPairingFailedError(err.message));
    });
  });
}

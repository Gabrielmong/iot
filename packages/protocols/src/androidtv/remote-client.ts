import { EventEmitter } from 'node:events';
import tls from 'node:tls';
import { certSha256, type ClientCertificate } from './certificate.js';
import { AndroidTvNotPairedError, CertificateMismatchError } from './errors.js';
import { FrameReader, KEY_DIRECTION_SHORT, decodeRemote, encodeRemote, type RemoteMessage } from './messages.js';

export const ANDROID_TV_REMOTE_PORT = 6466;
/** What the client announces itself as in RemoteConfigure (value from androidtv-remote). */
const CONFIGURE_CODE = 622;
/** TLS alerts a TV sends when it no longer knows our client certificate. */
const CERT_REFUSED = new Set([
  'ERR_SSL_SSLV3_ALERT_CERTIFICATE_UNKNOWN',
  'ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE',
  'ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED',
  'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA',
]);

/** A connect error, as AndroidTvNotPairedError when the TV refused our certificate. */
export function remoteConnectError(err: Error): Error {
  return CERT_REFUSED.has((err as NodeJS.ErrnoException).code ?? '') ? new AndroidTvNotPairedError() : err;
}

/** The TV pings every 5 s; silence for this long means the connection is dead. */
const IDLE_TIMEOUT_MS = 15_000;

export interface PairedTv extends ClientCertificate {
  /** SHA-256 of the TV certificate seen at pairing; any other certificate is refused. */
  tvCertSha256: string;
}

export interface AndroidTvRemoteOptions {
  port?: number;
  /** Connect + handshake. Default 5 s. */
  connectTimeoutMs?: number;
}

/**
 * The remote-control connection (port 6466). Emits `power(on)` when the TV reports its screen state,
 * `connected` once the TV has configured the session, and `disconnected` once when it ends.
 */
export class AndroidTvRemote extends EventEmitter {
  private socket: tls.TLSSocket | undefined;
  private ready = false;
  private closed = false;

  constructor(
    private readonly host: string,
    private readonly paired: PairedTv,
    private readonly opts: AndroidTvRemoteOptions = {},
  ) {
    super();
  }

  /**
   * Resolves once the TV configured the session; rejects with CertificateMismatchError on a different TV and
   * AndroidTvNotPairedError when the TV refuses our certificate (its pairing was removed on the TV).
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({
        host: this.host,
        port: this.opts.port ?? ANDROID_TV_REMOTE_PORT,
        cert: this.paired.certPem,
        key: this.paired.keyPem,
        // The TV's certificate is self-signed: it is checked against the pin below, before anything is sent.
        rejectUnauthorized: false,
      });
      this.socket = socket;
      let settled = false;
      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          socket.destroy();
          reject(err);
        } else resolve();
      };
      const timer = setTimeout(() => settle(new Error('The TV did not answer')), this.opts.connectTimeoutMs ?? 5000);

      socket.once('secureConnect', () => {
        if (certSha256(socket.getPeerCertificate().raw) !== this.paired.tvCertSha256) return settle(new CertificateMismatchError());
        socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy());
        const frames = new FrameReader();
        socket.on('data', (chunk: Buffer) => {
          try {
            for (const body of frames.push(chunk)) this.onMessage(decodeRemote(body), () => settle());
          } catch {
            socket.destroy();
          }
        });
      });
      socket.on('error', (err) => settle(remoteConnectError(err)));
      socket.on('close', () => {
        settle(new Error('The TV closed the connection'));
        this.ready = false;
        if (!this.closed && settled) {
          this.closed = true;
          this.emit('disconnected');
        }
      });
    });
  }

  /** Presses a key once (an Android keycode). Throws when not connected. */
  sendKey(keyCode: number): void {
    this.send({ remoteKeyInject: { keyCode, direction: KEY_DIRECTION_SHORT } });
  }

  /** Opens an app by its link (e.g. https://www.netflix.com/title). */
  launch(appLink: string): void {
    this.send({ remoteAppLinkLaunchRequest: { appLink } });
  }

  close(): void {
    this.closed = true;
    this.socket?.destroy();
  }

  get isConnected(): boolean {
    return this.ready;
  }

  private send(m: RemoteMessage): void {
    if (!this.ready || !this.socket) throw new Error('Not connected to the TV');
    this.socket.write(encodeRemote(m));
  }

  private onMessage(m: RemoteMessage, onReady: () => void): void {
    const socket = this.socket!;
    if (m.remoteConfigure) {
      socket.write(encodeRemote({ remoteConfigure: { code1: CONFIGURE_CODE, deviceInfo: { model: 'home-control', vendor: 'home-control', unknown1: 1, unknown2: '1', packageName: 'home-control', appVersion: '1.0.0' } } }));
      if (!this.ready) {
        this.ready = true;
        onReady();
        this.emit('connected');
      }
    } else if (m.remoteSetActive) {
      socket.write(encodeRemote({ remoteSetActive: { active: CONFIGURE_CODE } }));
    } else if (m.remotePingRequest) {
      socket.write(encodeRemote({ remotePingResponse: { val1: m.remotePingRequest.val1 ?? 0 } }));
    } else if (m.remoteStart) {
      this.emit('power', m.remoteStart.started === true);
    }
  }
}

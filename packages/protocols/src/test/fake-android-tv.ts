import { X509Certificate, createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import tls from 'node:tls';
import { certSha256 } from '../androidtv/certificate.js';
import {
  FrameReader,
  PAIRING_PROTOCOL_VERSION,
  PAIRING_STATUS_BAD_SECRET,
  PAIRING_STATUS_OK,
  decodePairing,
  decodeRemote,
  encodePairing,
  encodeRemote,
  type PairingMessage,
  type RemoteMessage,
} from '../androidtv/messages.js';
import vector from './fixtures/androidtv-pairing.json' with { type: 'json' };

export interface FakeAndroidTvOptions {
  /** Status for every pairing answer (default 200). */
  pairingStatus?: number;
  /** What RemoteStart reports. Default false. */
  powerOn?: boolean;
}

function rsaBytes(pem: string | Buffer): Buffer[] {
  const jwk = new X509Certificate(pem).publicKey.export({ format: 'jwk' });
  return [Buffer.from(jwk.n!, 'base64url'), Buffer.from(jwk.e!, 'base64url')];
}

/**
 * A TV speaking Android TV Remote v2 on two local TLS ports: pairing (shows a code derived the way a
 * real TV does, and checks the secret) and remote (configure, set-active, start, pings).
 */
export class FakeAndroidTv {
  readonly received: RemoteMessage[] = [];
  showingCode: string | undefined;
  pairedClients = 0;
  readonly certSha256 = certSha256(new X509Certificate(vector.tvCertPem).raw);
  private readonly sockets = new Set<tls.TLSSocket>();
  private readonly remoteSockets = new Set<tls.TLSSocket>();

  private constructor(
    private readonly pairingServer: tls.Server,
    private readonly remoteServer: tls.Server,
    private readonly opts: FakeAndroidTvOptions,
  ) {}

  static async start(opts: FakeAndroidTvOptions = {}): Promise<FakeAndroidTv> {
    const serverOpts = { cert: vector.tvCertPem, key: vector.tvKeyPem, requestCert: true, rejectUnauthorized: false };
    const tv: FakeAndroidTv = new FakeAndroidTv(
      tls.createServer(serverOpts, (s) => tv.onPairing(s)),
      tls.createServer(serverOpts, (s) => tv.onRemote(s)),
      opts,
    );
    await Promise.all([tv.pairingServer, tv.remoteServer].map((srv) => new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))));
    return tv;
  }

  get pairingPort(): number {
    return (this.pairingServer.address() as AddressInfo).port;
  }

  get remotePort(): number {
    return (this.remoteServer.address() as AddressInfo).port;
  }

  /** Sends a RemotePingRequest to every remote client. */
  ping(val1: number): void {
    for (const s of this.remoteSockets) s.write(encodeRemote({ remotePingRequest: { val1, val2: 0 } }));
  }

  dropClients(): void {
    for (const s of this.remoteSockets) s.destroy();
  }

  async close(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    await Promise.all([this.pairingServer, this.remoteServer].map((srv) => new Promise((r) => srv.close(r))));
  }

  private track(s: tls.TLSSocket): void {
    this.sockets.add(s);
    s.on('close', () => this.sockets.delete(s));
    s.on('error', () => undefined);
  }

  private onPairing(s: tls.TLSSocket): void {
    this.track(s);
    const frames = new FrameReader();
    const reply = (m: PairingMessage) => s.write(encodePairing({ protocolVersion: PAIRING_PROTOCOL_VERSION, status: this.opts.pairingStatus ?? PAIRING_STATUS_OK, ...m }));
    let expected: Buffer | undefined;
    s.on('data', (chunk: Buffer) => {
      for (const body of frames.push(chunk)) {
        const m = decodePairing(body);
        if (m.pairingRequest) reply({ pairingRequestAck: { serverName: 'Fake TV' } });
        else if (m.pairingOption) reply({ pairingOption: m.pairingOption });
        else if (m.pairingConfiguration) {
          const nonce = randomBytes(2);
          const [cn, ce] = rsaBytes(s.getPeerCertificate().raw);
          const [sn, se] = rsaBytes(vector.tvCertPem);
          expected = createHash('sha256').update(cn).update(ce).update(sn).update(se).update(nonce).digest();
          this.showingCode = (expected.subarray(0, 1).toString('hex') + nonce.toString('hex')).toUpperCase();
          reply({ pairingConfigurationAck: {} });
        } else if (m.pairingSecret) {
          const ok = expected && Buffer.from(m.pairingSecret.secret ?? []).equals(expected);
          if (ok) this.pairedClients++;
          s.write(encodePairing({ protocolVersion: PAIRING_PROTOCOL_VERSION, status: ok ? PAIRING_STATUS_OK : PAIRING_STATUS_BAD_SECRET, pairingSecretAck: { secret: Buffer.alloc(0) } }));
        }
      }
    });
  }

  private onRemote(s: tls.TLSSocket): void {
    this.track(s);
    this.remoteSockets.add(s);
    s.on('close', () => this.remoteSockets.delete(s));
    const frames = new FrameReader();
    s.on('data', (chunk: Buffer) => {
      for (const body of frames.push(chunk)) {
        const m = decodeRemote(body);
        this.received.push(m);
        if (m.remoteConfigure) s.write(encodeRemote({ remoteSetActive: {} }));
        else if (m.remoteSetActive) s.write(encodeRemote({ remoteStart: { started: this.opts.powerOn ?? false } }));
      }
    });
    s.write(encodeRemote({ remoteConfigure: { code1: 622, deviceInfo: { model: 'Fake', vendor: 'Fake' } } }));
  }
}

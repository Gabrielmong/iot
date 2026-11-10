import { X509Certificate } from 'node:crypto';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import type { AddressInfo, Socket } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { certFingerprint } from '../net/pinned-tls.js';
import tvCert from './fixtures/androidtv-pairing.json' with { type: 'json' };
import info from './fixtures/samsung-api-v2.json' with { type: 'json' };

export interface FakeSamsungTvOptions {
  /** Tokens a connection may present. */
  validTokens?: string[];
  /** Issued when a connection without a token is accepted. */
  issueToken?: string;
  /** What happens to a connection without a token: someone accepts, denies, or nobody answers. */
  onNoToken?: 'accept' | 'deny' | 'ignore';
}

/** A Samsung Tizen TV: /api/v2/ over HTTP, and the remote-control WebSocket over TLS with token auth. */
export class FakeSamsungTv {
  readonly received: unknown[] = [];
  readonly clientNames: string[] = [];
  readonly certSha256 = certFingerprint(new X509Certificate(tvCert.tvCertPem).raw);
  private readonly clients = new Set<WebSocket>();
  private readonly sockets = new Set<Socket>();

  private constructor(
    private readonly http: HttpServer,
    private readonly https: HttpsServer,
    private readonly wss: WebSocketServer,
    private readonly opts: FakeSamsungTvOptions,
  ) {
    wss.on('connection', (ws, req) => this.onConnection(ws, new URL(req.url ?? '/', 'https://tv')));
    // Upgraded sockets leave the server's own tracking, so close() destroys them itself.
    https.on('secureConnection', (s: Socket) => {
      this.sockets.add(s);
      s.on('close', () => this.sockets.delete(s));
    });
  }

  static async start(opts: FakeSamsungTvOptions = {}): Promise<FakeSamsungTv> {
    const http = createHttpServer((req, res) => {
      if (req.url === '/api/v2/') res.setHeader('content-type', 'application/json').end(JSON.stringify(info));
      else res.writeHead(404).end();
    });
    const https = createHttpsServer({ cert: tvCert.tvCertPem, key: tvCert.tvKeyPem });
    const wss = new WebSocketServer({ server: https, path: '/api/v2/channels/samsung.remote.control' });
    const tv = new FakeSamsungTv(http, https, wss, opts);
    await Promise.all([http, https].map((s) => new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))));
    return tv;
  }

  get infoPort(): number {
    return (this.http.address() as AddressInfo).port;
  }

  get wsPort(): number {
    return (this.https.address() as AddressInfo).port;
  }

  dropClients(): void {
    for (const ws of this.clients) ws.terminate();
  }

  async close(): Promise<void> {
    this.dropClients();
    for (const s of this.sockets) s.destroy();
    this.wss.close();
    this.https.closeAllConnections();
    this.http.closeAllConnections();
    await Promise.all([this.http, this.https].map((s) => new Promise((r) => s.close(r))));
  }

  private onConnection(ws: WebSocket, url: URL): void {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    this.clientNames.push(Buffer.from(url.searchParams.get('name') ?? '', 'base64').toString());
    ws.on('message', (raw) => this.received.push(JSON.parse(raw.toString())));
    const token = url.searchParams.get('token');
    const send = (m: object) => ws.send(JSON.stringify(m));
    if (token !== null) {
      if (this.opts.validTokens?.includes(token)) send({ event: 'ms.channel.connect', data: { clients: [], id: 'c1' } });
      else send({ event: 'ms.channel.unauthorized' });
      return;
    }
    const answer = this.opts.onNoToken ?? 'accept';
    if (answer === 'accept') setTimeout(() => send({ event: 'ms.channel.connect', data: { token: this.opts.issueToken ?? '11111111', id: 'c1' } }), 20);
    else if (answer === 'deny') setTimeout(() => send({ event: 'ms.channel.unauthorized' }), 20);
  }
}

import { createHash } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';

/** What the fake answers for one request path (the part of the URL after host:port). */
export type FakeRtspRoute =
  | { status: 200; sdp: string }
  | { status: 404 }
  | { status: 401 }
  /** Close the connection without answering. */
  | { status: 'drop' }
  /** Never answer. */
  | { status: 'hang' };

export interface FakeRtspOptions {
  username: string;
  password: string;
  /** Challenge scheme. Default `digest`. */
  scheme?: 'digest' | 'basic';
  realm?: string;
  nonce?: string;
  /** Offer `qop="auth"` in the Digest challenge. */
  qop?: boolean;
  /** With `digest`: send a Basic challenge header before the Digest one (both schemes offered). */
  offerBasicFirst?: boolean;
  /** Close the connection after sending a 401 challenge. */
  closeAfterChallenge?: boolean;
  /** Accept connections but never answer. */
  silent?: boolean;
  /** Responses by path; unknown paths answer 404. */
  routes?: Record<string, FakeRtspRoute>;
}

/** One request the fake received, for assertions. */
export interface FakeRtspRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  raw: string;
}

/** An RTSP server on an ephemeral localhost port that challenges for auth and answers DESCRIBE per path. */
export class FakeRtspServer {
  readonly requests: FakeRtspRequest[] = [];
  private readonly sockets = new Set<Socket>();

  private constructor(
    private readonly server: Server,
    private readonly opts: FakeRtspOptions,
  ) {}

  static async start(opts: FakeRtspOptions): Promise<FakeRtspServer> {
    const server = createServer();
    const fake = new FakeRtspServer(server, opts);
    server.on('connection', (socket) => fake.accept(socket));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return fake;
  }

  get port(): number {
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') throw new Error('fake RTSP server not listening');
    return addr.port;
  }

  async close(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private accept(socket: Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => undefined);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      let end: number;
      while ((end = buffer.indexOf('\r\n\r\n')) >= 0) {
        const raw = buffer.slice(0, end);
        buffer = buffer.slice(end + 4);
        this.handle(socket, raw);
      }
    });
  }

  private handle(socket: Socket, raw: string): void {
    const [requestLine = '', ...headerLines] = raw.split('\r\n');
    const [method = '', url = ''] = requestLine.split(' ');
    const headers: Record<string, string> = {};
    for (const line of headerLines) {
      const i = line.indexOf(':');
      if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    this.requests.push({ method, url, headers, raw });
    if (this.opts.silent) return;

    const cseq = headers.cseq ?? '0';
    if (!this.authorised(method, headers.authorization)) {
      this.reply(socket, cseq, '401 Unauthorized', this.challengeHeaders());
      if (this.opts.closeAfterChallenge) socket.end();
      return;
    }
    const route = this.opts.routes?.[pathOf(url)] ?? { status: 404 };
    if (route.status === 'drop') {
      socket.destroy();
    } else if (route.status === 'hang') {
      return;
    } else if (route.status === 200) {
      this.reply(socket, cseq, '200 OK', ['Content-Type: application/sdp', `Content-Base: ${url}/`], route.sdp);
    } else if (route.status === 401) {
      this.reply(socket, cseq, '401 Unauthorized', this.challengeHeaders());
    } else {
      this.reply(socket, cseq, '404 Not Found', []);
    }
  }

  private challengeHeaders(): string[] {
    const basicFirst = this.opts.offerBasicFirst && this.opts.scheme !== 'basic' ? [`WWW-Authenticate: Basic realm="${this.realm}"`] : [];
    return [...basicFirst, `WWW-Authenticate: ${this.challenge()}`];
  }

  private challenge(): string {
    if (this.opts.scheme === 'basic') return `Basic realm="${this.realm}"`;
    return `Digest realm="${this.realm}", nonce="${this.nonce}"${this.opts.qop ? ', qop="auth"' : ''}`;
  }

  private authorised(method: string, header: string | undefined): boolean {
    if (!header) return false;
    const { username, password } = this.opts;
    if (this.opts.scheme === 'basic') {
      return header === `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
    if (!header.startsWith('Digest ')) return false;
    const p = Object.fromEntries([...header.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)].map((m) => [m[1], m[2] ?? m[3]]));
    if (p.username !== username || p.realm !== this.realm || p.nonce !== this.nonce || !p.uri) return false;
    const ha1 = md5(`${username}:${this.realm}:${password}`);
    const ha2 = md5(`${method}:${p.uri}`);
    const expected = this.opts.qop
      ? p.qop === 'auth' && md5(`${ha1}:${this.nonce}:${p.nc}:${p.cnonce}:auth:${ha2}`)
      : md5(`${ha1}:${this.nonce}:${ha2}`);
    return p.response === expected;
  }

  private reply(socket: Socket, cseq: string, status: string, headers: string[], body = ''): void {
    const lines = [`RTSP/1.0 ${status}`, `CSeq: ${cseq}`, 'Server: Rtsp Server', ...headers];
    if (body) lines.push(`Content-Length: ${Buffer.byteLength(body)}`);
    socket.write(`${lines.join('\r\n')}\r\n\r\n${body}`);
  }

  private get realm(): string {
    return this.opts.realm ?? 'Surveillance Server';
  }

  private get nonce(): string {
    return this.opts.nonce ?? '16210181';
  }
}

function pathOf(url: string): string {
  const m = /^rtsp:\/\/[^/]+(\/.*)?$/.exec(url);
  return m?.[1] ?? '/';
}

function md5(s: string): string {
  return createHash('md5').update(s).digest('hex');
}

/** A minimal SDP with one video track of the given encoding. */
export function sdpWithVideo(encoding: 'H264' | 'H265' | 'JPEG'): string {
  return [
    'v=0',
    'o=- 0 0 IN IP4 127.0.0.1',
    's=Media Server',
    't=0 0',
    'm=video 0 RTP/AVP 96',
    `a=rtpmap:96 ${encoding}/90000`,
    'a=control:trackID=0',
    'm=audio 0 RTP/AVP 8',
    'a=rtpmap:8 PCMA/8000',
    '',
  ].join('\r\n');
}

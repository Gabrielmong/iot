import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

/** One media profile the fake offers. */
export interface FakeOnvifProfile {
  token: string;
  /** What GetStreamUri answers for this profile (may carry userinfo or another host). */
  uri: string;
  encoding?: 'H264' | 'H265' | 'JPEG';
}

export interface FakeOnvifOptions {
  username: string;
  password: string;
  profiles?: FakeOnvifProfile[];
  /** The camera's UTC clock (default: now). */
  clock?: () => Date;
  /** Path the media service answers on. Default `/onvif/media_service`. */
  mediaPath?: string;
  /** The Media XAddr GetCapabilities reports; omitted ⇒ GetCapabilities faults (not implemented). */
  mediaXAddr?: string;
  /** Answer a failed login with HTTP 401 instead of a 400 SOAP fault. */
  authStatus401?: boolean;
  /** How far `Created` may be from the camera's clock. Default 60 s. */
  maxSkewMs?: number;
  /**
   * Require HTTP auth on every call, GetSystemDateAndTime included: `digest` (RFC 2617 MD5, which then
   * replaces the WS-Security check) or `basic` (a Basic-only challenge that nothing here passes).
   */
  httpAuth?: 'digest' | 'basic';
  /** Offer `qop="auth"` in the Digest challenge. */
  qop?: boolean;
}

/** One SOAP request the fake received, for assertions. */
export interface FakeOnvifRequest {
  path: string;
  action: string;
  contentType: string;
  body: string;
  /** The Authorization header, if any. */
  authorization?: string;
}

const DEVICE_PATH = '/onvif/device_service';
const REALM = 'IP Camera';
const NONCE = 'a1b2c3d4e5';
const ENVELOPE_NS = 'http://www.w3.org/2003/05/soap-envelope';

/** An ONVIF device + media service on an ephemeral localhost port, checking WS-Security PasswordDigest. */
export class FakeOnvifServer {
  readonly requests: FakeOnvifRequest[] = [];
  private readonly sockets = new Set<Socket>();

  private constructor(
    private readonly server: Server,
    private readonly opts: FakeOnvifOptions,
  ) {}

  static async start(opts: FakeOnvifOptions): Promise<FakeOnvifServer> {
    const server = createServer();
    const fake = new FakeOnvifServer(server, opts);
    server.on('connection', (socket) => {
      fake.sockets.add(socket);
      socket.on('close', () => fake.sockets.delete(socket));
    });
    server.on('request', (req, res) => fake.receive(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return fake;
  }

  get port(): number {
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') throw new Error('fake ONVIF server not listening');
    return addr.port;
  }

  async close(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private receive(req: IncomingMessage, res: ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const contentType = req.headers['content-type'] ?? '';
      const action = /action="([^"]*)"/.exec(contentType)?.[1] ?? '';
      const request: FakeOnvifRequest = { path: req.url ?? '/', action, contentType, body, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) };
      this.requests.push(request);
      this.answer(request, res);
    });
  }

  private answer(req: FakeOnvifRequest, res: ServerResponse): void {
    const op = req.action.slice(req.action.lastIndexOf('/') + 1);
    const mediaPath = this.opts.mediaPath ?? '/onvif/media_service';
    if (this.opts.httpAuth && !this.httpAuthorised(req)) return send(res, 401, '', { 'WWW-Authenticate': this.challenge() });
    if (op === 'GetSystemDateAndTime' && req.path === DEVICE_PATH) return send(res, 200, systemDateAndTime(this.clock()));
    if (!this.opts.httpAuth && !this.authorised(req.body)) {
      if (this.opts.authStatus401) return send(res, 401, '');
      return send(res, 400, fault('ter:NotAuthorized', 'Sender not Authorized'));
    }
    if (op === 'GetCapabilities' && req.path === DEVICE_PATH) {
      if (!this.opts.mediaXAddr) return send(res, 400, fault('ter:ActionNotSupported', 'Not implemented'));
      return send(res, 200, envelope(`<tds:GetCapabilitiesResponse><tds:Capabilities><tt:Media><tt:XAddr>${this.opts.mediaXAddr}</tt:XAddr></tt:Media></tds:Capabilities></tds:GetCapabilitiesResponse>`));
    }
    if (op === 'GetProfiles' && req.path === mediaPath) return send(res, 200, envelope(profilesXml(this.opts.profiles ?? [])));
    if (op === 'GetStreamUri' && req.path === mediaPath) {
      const token = /<(?:\w+:)?ProfileToken>([^<]*)</.exec(req.body)?.[1];
      const profile = this.opts.profiles?.find((p) => p.token === token);
      if (!profile) return send(res, 400, fault('ter:NoProfile', 'No such profile'));
      return send(res, 200, envelope(`<trt:GetStreamUriResponse><trt:MediaUri><tt:Uri>${escapeXml(profile.uri)}</tt:Uri></trt:MediaUri></trt:GetStreamUriResponse>`));
    }
    send(res, 400, fault('ter:ActionNotSupported', 'Unknown action'));
  }

  private challenge(): string {
    if (this.opts.httpAuth === 'basic') return `Basic realm="${REALM}"`;
    return `Digest realm="${REALM}", nonce="${NONCE}"${this.opts.qop ? ', qop="auth"' : ''}`;
  }

  /** RFC 2617 MD5 Digest for POST <path>; a Basic-only camera accepts nothing here. */
  private httpAuthorised(req: FakeOnvifRequest): boolean {
    const header = req.authorization;
    if (this.opts.httpAuth !== 'digest' || !header?.startsWith('Digest ')) return false;
    const p = Object.fromEntries([...header.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)].map((m) => [m[1], m[2] ?? m[3]]));
    if (p.username !== this.opts.username || p.realm !== REALM || p.nonce !== NONCE || p.uri !== req.path) return false;
    const ha1 = md5(`${this.opts.username}:${REALM}:${this.opts.password}`);
    const ha2 = md5(`POST:${req.path}`);
    const expected = this.opts.qop ? p.qop === 'auth' && md5(`${ha1}:${NONCE}:${p.nc}:${p.cnonce}:auth:${ha2}`) : md5(`${ha1}:${NONCE}:${ha2}`);
    return p.response === expected;
  }

  private clock(): Date {
    return this.opts.clock?.() ?? new Date();
  }

  /** WS-Security UsernameToken with PasswordDigest = Base64(SHA1(nonce + created + password)). */
  private authorised(body: string): boolean {
    const field = (name: string) => new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([^<]*)</`).exec(body)?.[1];
    const username = field('Username');
    const digest = field('Password');
    const nonce = field('Nonce');
    const created = field('Created');
    if (!/Type="[^"]*#PasswordDigest"/.test(body) || username !== this.opts.username || !digest || !nonce || !created) return false;
    const expected = createHash('sha1')
      .update(Buffer.concat([Buffer.from(nonce, 'base64'), Buffer.from(created), Buffer.from(this.opts.password)]))
      .digest('base64');
    const skew = Math.abs(Date.parse(created) - this.clock().getTime());
    return digest === expected && skew <= (this.opts.maxSkewMs ?? 60_000);
  }
}

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/soap+xml; charset=utf-8', ...headers });
  res.end(body);
}

function md5(s: string): string {
  return createHash('md5').update(s).digest('hex');
}

function envelope(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="${ENVELOPE_NS}" ` +
    'xmlns:tt="http://www.onvif.org/ver10/schema" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" ' +
    'xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:ter="http://www.onvif.org/ver10/error">' +
    `<SOAP-ENV:Body>${body}</SOAP-ENV:Body></SOAP-ENV:Envelope>`
  );
}

function fault(subcode: string, reason: string): string {
  return envelope(
    '<SOAP-ENV:Fault><SOAP-ENV:Code><SOAP-ENV:Value>SOAP-ENV:Sender</SOAP-ENV:Value>' +
      `<SOAP-ENV:Subcode><SOAP-ENV:Value>${subcode}</SOAP-ENV:Value></SOAP-ENV:Subcode></SOAP-ENV:Code>` +
      `<SOAP-ENV:Reason><SOAP-ENV:Text xml:lang="en">${reason}</SOAP-ENV:Text></SOAP-ENV:Reason></SOAP-ENV:Fault>`,
  );
}

function systemDateAndTime(d: Date): string {
  return envelope(
    '<tds:GetSystemDateAndTimeResponse><tds:SystemDateAndTime><tt:DateTimeType>NTP</tt:DateTimeType><tt:UTCDateTime>' +
      `<tt:Time><tt:Hour>${d.getUTCHours()}</tt:Hour><tt:Minute>${d.getUTCMinutes()}</tt:Minute><tt:Second>${d.getUTCSeconds()}</tt:Second></tt:Time>` +
      `<tt:Date><tt:Year>${d.getUTCFullYear()}</tt:Year><tt:Month>${d.getUTCMonth() + 1}</tt:Month><tt:Day>${d.getUTCDate()}</tt:Day></tt:Date>` +
      '</tt:UTCDateTime></tds:SystemDateAndTime></tds:GetSystemDateAndTimeResponse>',
  );
}

function profilesXml(profiles: FakeOnvifProfile[]): string {
  const items = profiles.map(
    (p) =>
      `<trt:Profiles token="${p.token}" fixed="true"><tt:Name>${p.token}</tt:Name>` +
      `<tt:VideoEncoderConfiguration token="v-${p.token}"><tt:Encoding>${p.encoding ?? 'H264'}</tt:Encoding></tt:VideoEncoderConfiguration></trt:Profiles>`,
  );
  return `<trt:GetProfilesResponse>${items.join('')}</trt:GetProfilesResponse>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

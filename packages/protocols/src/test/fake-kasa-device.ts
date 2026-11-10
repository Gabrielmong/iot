import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { authHash, handshake1Hash, handshake2Hash, type KlapVariant } from '../kasa/klap-auth.js';
import { KlapCipher } from '../kasa/klap-cipher.js';

export interface FakeKasaChild {
  id: string;
  alias: string;
  state: 0 | 1;
}

export interface FakeKasaOptions {
  variant: KlapVariant;
  username: string;
  password: string;
  deviceId?: string;
  model?: string;
  alias?: string;
  children?: FakeKasaChild[];
  /** Relay state of a single plug (used when there are no children). */
  relayState?: 0 | 1;
  /** Value of the TIMEOUT cookie sent with handshake1, in seconds. */
  timeoutSeconds?: number;
}

/** What the fake saw, for assertions. */
export interface FakeKasaLogEntry {
  path: string;
  cookie: string | undefined;
  status: number;
  /** The `?seq=` value, for `/app/request`. */
  seq?: number;
  /** Decrypted request JSON, for `/app/request`. */
  json?: unknown;
}

interface PendingSession {
  id: string;
  localSeed: Buffer;
  remoteSeed: Buffer;
  cipher?: KlapCipher;
}

/** A KLAP-speaking IOT device (KP303-shaped) on an ephemeral localhost HTTP port. */
export class FakeKasaDevice {
  readonly log: FakeKasaLogEntry[] = [];
  readonly children: FakeKasaChild[];
  relayState: 0 | 1;
  /**
   * Faults for upcoming `/app/request` calls, consumed in order: `forbidden` answers 403 and drops the
   * session (as after a device-side session drop), `error` answers 500, `corrupt` answers 200 with an
   * undecryptable body.
   */
  readonly faults: ('forbidden' | 'error' | 'corrupt')[] = [];
  private readonly authHash: Buffer;
  private readonly sessions = new Map<string, PendingSession>();

  private constructor(
    private readonly server: Server,
    private readonly opts: FakeKasaOptions,
  ) {
    this.authHash = authHash(opts.variant, opts.username, opts.password);
    this.children = (opts.children ?? []).map((c) => ({ ...c }));
    this.relayState = opts.relayState ?? 0;
  }

  static async start(opts: FakeKasaOptions): Promise<FakeKasaDevice> {
    const server = createServer();
    const device = new FakeKasaDevice(server, opts);
    server.on('request', (req, res) => void device.handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return device;
  }

  get port(): number {
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') throw new Error('fake device not listening');
    return addr.port;
  }

  get handshakeCount(): number {
    return this.log.filter((e) => e.path === '/app/handshake2' && e.status === 200).length;
  }

  get requests(): unknown[] {
    return this.log.filter((e) => e.json !== undefined).map((e) => e.json);
  }

  async close(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    const url = new URL(req.url ?? '/', 'http://fake');
    const cookie = req.headers.cookie;
    const entry: FakeKasaLogEntry = { path: url.pathname, cookie, status: 200 };
    this.log.push(entry);
    const reply = (status: number, data?: Buffer, headers: Record<string, string> = {}) => {
      entry.status = status;
      res.writeHead(status, { Server: 'SHIP 2.0', ...headers });
      res.end(data);
    };

    if (req.method !== 'POST') return reply(405);
    // Real KP303 firmware (SHIP 2.0) only recognises the exact header name "Content-Length" and
    // answers 400 to the lowercase form that fetch/undici always sends.
    if (!req.rawHeaders.includes('Content-Length')) return reply(400);
    if (url.pathname === '/app/handshake1') {
      const session: PendingSession = { id: randomBytes(16).toString('hex').toUpperCase(), localSeed: body, remoteSeed: randomBytes(16) };
      this.sessions.set(session.id, session);
      const serverHash = handshake1Hash(this.opts.variant, session.localSeed, session.remoteSeed, this.authHash);
      const timeout = this.opts.timeoutSeconds ?? 86400;
      return reply(200, Buffer.concat([session.remoteSeed, serverHash]), { 'Set-Cookie': `TP_SESSIONID=${session.id};TIMEOUT=${timeout}` });
    }

    const session = this.sessions.get(sessionIdOf(cookie) ?? '');
    if (!session) return reply(403);
    if (url.pathname === '/app/handshake2') {
      const expected = handshake2Hash(this.opts.variant, session.localSeed, session.remoteSeed, this.authHash);
      if (!expected.equals(body)) return reply(403);
      session.cipher = new KlapCipher(session.localSeed, session.remoteSeed, this.authHash);
      return reply(200);
    }
    if (url.pathname === '/app/request' && session.cipher) {
      const seq = Number(url.searchParams.get('seq'));
      entry.seq = seq;
      const fault = this.faults.shift();
      if (fault === 'forbidden') {
        this.sessions.delete(session.id);
        return reply(403);
      }
      if (fault === 'error') return reply(500);
      if (fault === 'corrupt') return reply(200, Buffer.alloc(64, 0xa5));
      const plaintext = session.cipher.decrypt(body, seq);
      // KLAP encryption is deterministic for a seq, so re-encrypting also checks the signature.
      if (!session.cipher.encrypt(plaintext, seq).equals(body)) return reply(400);
      const json = JSON.parse(plaintext.toString('utf8')) as Record<string, any>;
      entry.json = json;
      const response = Buffer.from(JSON.stringify(this.execute(json)));
      return reply(200, session.cipher.encrypt(response, seq));
    }
    return reply(404);
  }

  private execute(json: Record<string, any>): unknown {
    const system = json.system ?? {};
    if ('get_sysinfo' in system) return { system: { get_sysinfo: { ...this.sysinfo(), err_code: 0 } } };
    if ('set_relay_state' in system) {
      const ids: string[] | undefined = json.context?.child_ids;
      if (!ids) {
        this.relayState = system.set_relay_state.state;
        return { system: { set_relay_state: { err_code: 0 } } };
      }
      const targets = this.children.filter((c) => ids.includes(c.id));
      if (targets.length !== ids.length) return { system: { set_relay_state: { err_code: -14, err_msg: 'entry not exist' } } };
      for (const c of targets) c.state = system.set_relay_state.state;
      return { system: { set_relay_state: { err_code: 0 } } };
    }
    return { system: { err_code: -1, err_msg: 'module not support' } };
  }

  private sysinfo(): Record<string, unknown> {
    return {
      sw_ver: '1.0.21 Build 231129 Rel.171238',
      hw_ver: '2.0',
      model: this.opts.model ?? 'KP303(US)',
      deviceId: this.opts.deviceId ?? '8006A1B2C3D4E5F60718293A4B5C6D7E8F901234',
      alias: this.opts.alias ?? 'TP-LINK_Power Strip_ABCD',
      mic_type: 'IOT.SMARTPLUGSWITCH',
      ...(this.children.length
        ? {
            child_num: this.children.length,
            children: this.children.map((c) => ({ id: c.id, state: c.state, alias: c.alias, on_time: 0, next_action: { type: -1 } })),
          }
        : { relay_state: this.relayState }),
    };
  }
}

function sessionIdOf(cookie: string | undefined): string | undefined {
  return cookie?.match(/(?:^|;\s*)TP_SESSIONID=([^;]*)/)?.[1];
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

import { createServer as createHttpServer } from 'node:http';
import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeOnvifServer, type FakeOnvifOptions } from '../test/fake-onvif-server.js';
import { OnvifAuthError, OnvifNoStreamError, OnvifUnreachableError } from './errors.js';
import { DEFAULT_ONVIF_PORTS, findOnvifPort } from './find-port.js';
import { onvifStreamUris } from './media.js';
import { probeOnvif } from './probe.js';

const PASSWORD = 'On-v1f s3cret!';
const creds = { username: 'admin', password: PASSWORD };
const PROFILES = [
  { token: 'main', uri: 'rtsp://127.0.0.1:8554/onvif1', encoding: 'H265' as const },
  { token: 'sub', uri: 'rtsp://127.0.0.1:8554/onvif2', encoding: 'H264' as const },
  { token: 'third', uri: 'rtsp://127.0.0.1:8554/onvif3' },
];

let fake: FakeOnvifServer | undefined;
const others: Server[] = [];
const sockets = new Set<Socket>();

afterEach(async () => {
  await fake?.close();
  fake = undefined;
  for (const s of sockets) s.destroy();
  sockets.clear();
  for (const s of others.splice(0)) await new Promise<void>((resolve) => s.close(() => resolve()));
});

/** Listens on an ephemeral localhost port; its connections are destroyed after each test. */
async function listen(server: Server): Promise<number> {
  others.push(server);
  server.on('connection', (socket: Socket) => sockets.add(socket));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
}

async function start(over: Partial<FakeOnvifOptions> = {}): Promise<number> {
  fake = await FakeOnvifServer.start({ username: 'admin', password: PASSWORD, profiles: PROFILES, ...over });
  return fake.port;
}

/** A port nothing listens on. */
async function closedPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((resolve) => s.close(() => resolve()));
  return port;
}

/** A TCP server that accepts and never answers. */
async function silentPort(): Promise<number> {
  return listen(createServer(() => undefined));
}

async function errorOf(p: Promise<unknown>): Promise<Error> {
  const e = await p.then(() => undefined, (err: unknown) => err);
  if (!(e instanceof Error)) throw new Error('expected a rejection');
  return e;
}

describe('findOnvifPort', () => {
  it('tries 8000, 80, 5000, 8899, 2020, 6688 and 8080 by default', () => {
    expect(DEFAULT_ONVIF_PORTS).toEqual([8000, 80, 5000, 8899, 2020, 6688, 8080]);
  });

  it('counts an HTTP 401 as ONVIF answering, with the clock unknown', async () => {
    const port = await start({ httpAuth: 'digest' });
    expect(await findOnvifPort('127.0.0.1', { ports: [await closedPort(), port], timeoutMs: 1000 })).toEqual({ port });
    expect(fake!.requests.every((r) => r.authorization === undefined)).toBe(true);
  });

  it('uses the first port that answers GetSystemDateAndTime, unauthenticated', async () => {
    const port = await start();
    const found = await findOnvifPort('127.0.0.1', { ports: [await closedPort(), port], timeoutMs: 1000 });
    expect(found.port).toBe(port);
    expect(fake!.requests.map((r) => r.action)).toEqual(['http://www.onvif.org/ver10/device/wsdl/GetSystemDateAndTime']);
    expect(fake!.requests[0]!.body).not.toContain('Security');
  });

  it('measures the camera clock offset', async () => {
    const port = await start({ clock: () => new Date(Date.now() + 3_600_000) });
    const { clockOffsetMs } = await findOnvifPort('127.0.0.1', { ports: [port] });
    expect(Math.abs(clockOffsetMs - 3_600_000)).toBeLessThan(3_000);
  });

  it('skips a port that is silent or answers something else, and fails when none answers', async () => {
    const webPort = await listen(createHttpServer((_, res) => res.end('<html>router</html>')));
    const err = await errorOf(findOnvifPort('127.0.0.1', { ports: [await closedPort(), await silentPort(), webPort], timeoutMs: 200 }));
    expect(err).toBeInstanceOf(OnvifUnreachableError);
  });
});

describe('onvifStreamUris', () => {
  it('returns the first two profiles as main and sub, with the main codec, over SOAP 1.2 with PasswordDigest', async () => {
    const port = await start();
    expect(await onvifStreamUris('127.0.0.1', port, creds)).toEqual({ main: PROFILES[0]!.uri, sub: PROFILES[1]!.uri, codec: 'H265' });
    const streamUri = fake!.requests.filter((r) => r.action.endsWith('/GetStreamUri'));
    expect(streamUri).toHaveLength(2);
    for (const r of fake!.requests) {
      expect(r.contentType).toBe(`application/soap+xml; charset=utf-8; action="${r.action}"`);
      expect(r.body).not.toContain(PASSWORD);
      expect(r.body).not.toContain('PasswordText');
    }
    expect(streamUri[0]!.body).toContain('RTP-Unicast');
    expect(streamUri[0]!.body).toContain('>RTSP<');
  });

  it('omits sub for a single profile and decodes entities in the URI', async () => {
    const port = await start({ profiles: [{ token: 'only', uri: 'rtsp://127.0.0.1/live?ch=1&type=0' }] });
    expect(await onvifStreamUris('127.0.0.1', port, creds)).toEqual({ main: 'rtsp://127.0.0.1/live?ch=1&type=0', codec: 'H264' });
  });

  it('uses the media XAddr path from GetCapabilities', async () => {
    const port = await start({ mediaPath: '/custom/media', mediaXAddr: 'http://127.0.0.1:1/custom/media' });
    expect((await onvifStreamUris('127.0.0.1', port, creds)).main).toBe(PROFILES[0]!.uri);
    expect(fake!.requests.filter((r) => r.action.endsWith('/GetProfiles')).map((r) => r.path)).toEqual(['/custom/media']);
  });

  it('corrects Created for the camera clock', async () => {
    const skew = 2 * 3_600_000;
    const port = await start({ clock: () => new Date(Date.now() - skew), maxSkewMs: 5_000 });
    await expect(onvifStreamUris('127.0.0.1', port, creds)).rejects.toBeInstanceOf(OnvifAuthError);
    await expect(onvifStreamUris('127.0.0.1', port, creds, { clockOffsetMs: -skew })).resolves.toMatchObject({ main: PROFILES[0]!.uri });
  });

  it.each([false, true])('raises OnvifAuthError for a wrong password (HTTP 401: %s), never echoing it', async (authStatus401) => {
    const port = await start({ authStatus401 });
    const err = await errorOf(onvifStreamUris('127.0.0.1', port, { username: 'admin', password: 'wrong-pass' }));
    expect(err).toBeInstanceOf(OnvifAuthError);
    expect(err.message).not.toContain('wrong-pass');
  });

  it('raises OnvifNoStreamError when the camera has no profiles', async () => {
    const port = await start({ profiles: [] });
    await expect(onvifStreamUris('127.0.0.1', port, creds)).rejects.toBeInstanceOf(OnvifNoStreamError);
  });

  it('raises OnvifUnreachableError when the camera stops answering', async () => {
    const port = await silentPort();
    await expect(onvifStreamUris('127.0.0.1', port, creds, { timeoutMs: 200 })).rejects.toBeInstanceOf(OnvifUnreachableError);
  });

  it('refuses an oversized response', async () => {
    const port = await listen(createHttpServer((_, res) => res.end(`<Envelope>${'x'.repeat(300 * 1024)}</Envelope>`)));
    await expect(onvifStreamUris('127.0.0.1', port, creds)).rejects.toBeInstanceOf(OnvifUnreachableError);
  });
});

describe('probeOnvif', () => {
  it('finds the port, then the stream URIs, and reports the port', async () => {
    const port = await start({ clock: () => new Date(Date.now() + 600_000), maxSkewMs: 5_000 });
    expect(await probeOnvif('127.0.0.1', creds, { ports: [await closedPort(), port] })).toEqual({
      port,
      main: PROFILES[0]!.uri,
      sub: PROFILES[1]!.uri,
      codec: 'H265',
    });
  });
});

describe('HTTP Digest cameras (every call, GetSystemDateAndTime included)', () => {
  it.each([false, true])('runs the whole flow with an RFC 2617 Digest retry (qop=auth: %s)', async (qop) => {
    const port = await start({ httpAuth: 'digest', qop });
    expect(await probeOnvif('127.0.0.1', creds, { ports: [await closedPort(), port] })).toEqual({
      port,
      main: PROFILES[0]!.uri,
      sub: PROFILES[1]!.uri,
      codec: 'H265',
    });
    const answered = fake!.requests.filter((r) => r.authorization);
    expect(answered.length).toBeGreaterThan(0);
    for (const r of answered) {
      expect(r.authorization).toMatch(/^Digest /);
      expect(r.authorization).toContain(`uri="${r.path}"`);
      if (qop) expect(r.authorization).toMatch(/qop=auth, nc=00000001, cnonce="[0-9a-f]+"/);
      expect(r.authorization).not.toContain(PASSWORD);
    }
    // Still sends WS-Security alongside, for cameras that want both.
    expect(answered.every((r) => r.body.includes('#PasswordDigest'))).toBe(true);
  });

  it('uses the camera clock from an authenticated GetSystemDateAndTime', async () => {
    const port = await start({ httpAuth: 'digest', clock: () => new Date(Date.now() + 7_200_000) });
    await probeOnvif('127.0.0.1', creds, { ports: [port] });
    const timeCalls = fake!.requests.filter((r) => r.action.endsWith('/GetSystemDateAndTime'));
    expect(timeCalls.some((r) => r.authorization?.startsWith('Digest '))).toBe(true);
    const created = /<wsu:Created>([^<]*)</.exec(fake!.requests.at(-1)!.body)?.[1] ?? '';
    expect(Math.abs(Date.parse(created) - (Date.now() + 7_200_000))).toBeLessThan(5_000);
  });

  it('raises OnvifAuthError for a wrong password, never echoing it', async () => {
    const port = await start({ httpAuth: 'digest' });
    const err = await errorOf(probeOnvif('127.0.0.1', { username: 'admin', password: 'wrong-pass' }, { ports: [port] }));
    expect(err).toBeInstanceOf(OnvifAuthError);
    expect(err.message).not.toContain('wrong-pass');
  });

  it('refuses a Basic-only camera without ever sending an Authorization header', async () => {
    const port = await start({ httpAuth: 'basic' });
    await expect(probeOnvif('127.0.0.1', creds, { ports: [port] })).rejects.toBeInstanceOf(OnvifAuthError);
    expect(fake!.requests.length).toBeGreaterThan(0);
    expect(fake!.requests.every((r) => r.authorization === undefined && !r.body.includes(PASSWORD))).toBe(true);
  });
});

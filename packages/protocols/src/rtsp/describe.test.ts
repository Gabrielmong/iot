import { afterEach, describe, expect, it } from 'vitest';
import { FakeRtspServer, sdpWithVideo, type FakeRtspOptions } from '../test/fake-rtsp-server.js';
import { rtspDescribe } from './describe.js';
import { RtspAuthUnsupportedError, RtspError, RtspTimeoutError } from './errors.js';
import { sdpVideoCodec } from './sdp.js';

const PASSWORD = 'pa55-W0rd-xyz';
const creds = { username: 'admin', password: PASSWORD };
let server: FakeRtspServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function start(opts: Partial<FakeRtspOptions> = {}): Promise<string> {
  server = await FakeRtspServer.start({ username: 'admin', password: PASSWORD, routes: { '/ch01/0': { status: 200, sdp: sdpWithVideo('H265') } }, ...opts });
  return `rtsp://127.0.0.1:${server.port}`;
}

describe('rtspDescribe', () => {
  it('answers a Digest challenge and returns the SDP (H265)', async () => {
    const base = await start();
    const res = await rtspDescribe(`${base}/ch01/0`, creds);
    expect(res.status).toBe(200);
    expect(sdpVideoCodec(res.sdp!)).toBe('H265');
    const [first, second] = server!.requests;
    expect(first!.headers.authorization).toBeUndefined();
    expect(first!.headers.accept).toBe('application/sdp');
    expect(first!.headers['user-agent']).toBeTruthy();
    expect(second!.headers.authorization).toMatch(/^Digest /);
    expect(second!.headers.authorization).toContain(`uri="${base}/ch01/0"`);
    expect(Number(second!.headers.cseq)).toBeGreaterThan(Number(first!.headers.cseq));
  });

  it('reports the offered auth schemes in order, even when it answers with Digest', async () => {
    const base = await start({ offerBasicFirst: true });
    const res = await rtspDescribe(`${base}/ch01/0`, creds);
    expect(res).toMatchObject({ status: 200, authSchemes: ['basic', 'digest'] });
    expect(server!.requests[1]!.headers.authorization).toMatch(/^Digest /);
  });

  it('reports a lone Digest challenge', async () => {
    const base = await start();
    expect((await rtspDescribe(`${base}/ch01/0`, creds)).authSchemes).toEqual(['digest']);
  });

  it('supports qop=auth digest challenges', async () => {
    const base = await start({ qop: true });
    expect((await rtspDescribe(`${base}/ch01/0`, creds)).status).toBe(200);
    expect(server!.requests[1]!.headers.authorization).toMatch(/qop=auth, nc=00000001, cnonce="[0-9a-f]+"/);
  });

  it('refuses a Basic-only challenge by default, sending no credentials', async () => {
    const base = await start({ scheme: 'basic' });
    const err = await rtspDescribe(`${base}/ch01/0`, creds).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RtspAuthUnsupportedError);
    expect((err as Error).message).not.toContain(PASSWORD);
    expect(server!.requests).toHaveLength(1);
    expect(server!.requests[0]!.headers.authorization).toBeUndefined();
  });

  it('answers a Basic-only challenge when allowBasic is set', async () => {
    const base = await start({ scheme: 'basic' });
    expect((await rtspDescribe(`${base}/ch01/0`, creds, 3000, { allowBasic: true })).status).toBe(200);
    expect(server!.requests[1]!.headers.authorization).toMatch(/^Basic /);
  });

  it('reconnects for the authorised retry when the server closes after the challenge', async () => {
    const base = await start({ closeAfterChallenge: true });
    expect((await rtspDescribe(`${base}/ch01/0`, creds)).status).toBe(200);
  });

  it('returns 401 when the credentials are wrong, retrying only once', async () => {
    const base = await start();
    const res = await rtspDescribe(`${base}/ch01/0`, { username: 'admin', password: 'nope' });
    expect(res).toEqual({ status: 401, authSchemes: ['digest'] });
    expect(server!.requests).toHaveLength(2);
  });

  it('returns 404 without an SDP for an unknown path', async () => {
    const base = await start();
    expect(await rtspDescribe(`${base}/ch09/0`, creds)).toEqual({ status: 404, authSchemes: ['digest'] });
  });

  it('never puts credentials in the request URL', async () => {
    const base = await start();
    await rtspDescribe(`rtsp://admin:${PASSWORD}@127.0.0.1:${server!.port}/ch01/0`, creds);
    expect(server!.requests.every((r) => r.url === `${base}/ch01/0`)).toBe(true);
    expect(server!.requests.some((r) => r.raw.includes(PASSWORD))).toBe(false);
  });

  it('times out with RtspTimeoutError when the server never answers', async () => {
    const base = await start({ silent: true });
    const err = await rtspDescribe(`rtsp://admin:${PASSWORD}@127.0.0.1:${server!.port}/ch01/0`, creds, 100).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RtspTimeoutError);
    expect((err as Error).message).toContain(`${base}/ch01/0`);
    expect((err as Error).message).not.toContain(PASSWORD);
  });

  it('rejects with RtspError (no userinfo) when nothing listens', async () => {
    const base = await start();
    const port = server!.port;
    await server!.close();
    server = undefined;
    const err = await rtspDescribe(`rtsp://admin:${PASSWORD}@127.0.0.1:${port}/ch01/0`, creds).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RtspError);
    expect((err as Error).message).toContain(`${base}/ch01/0`);
    expect((err as Error).message).not.toContain(PASSWORD);
    expect((err as Error).message).not.toContain('admin');
  });

  it('rejects an invalid URL without echoing it', async () => {
    const err = await rtspDescribe(`http://admin:${PASSWORD}@host/x`, creds).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RtspError);
    expect((err as Error).message).not.toContain(PASSWORD);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { FakeRtspServer, sdpWithVideo, type FakeRtspRoute } from '../test/fake-rtsp-server.js';
import { SwannAuthError, SwannNoStreamsError, SwannUnreachableError } from './errors.js';
import { SWANN_PATH_TEMPLATES } from './paths.js';
import { probeSwann } from './probe.js';

const PASSWORD = 'Sw4nn-s3cret!';
const creds = { username: 'admin', password: PASSWORD };
let server: FakeRtspServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function start(routes: Record<string, FakeRtspRoute>, scheme: 'digest' | 'basic' = 'digest'): Promise<number> {
  server = await FakeRtspServer.start({ username: 'admin', password: PASSWORD, routes, scheme });
  return server.port;
}

const ok = (codec: 'H264' | 'H265' = 'H264'): FakeRtspRoute => ({ status: 200, sdp: sdpWithVideo(codec) });

async function errorOf(p: Promise<unknown>): Promise<Error> {
  const e = await p.then(() => undefined, (err: unknown) => err);
  if (!(e instanceof Error)) throw new Error('expected a rejection');
  return e;
}

describe('SWANN_PATH_TEMPLATES', () => {
  it('lists the three templates in order with their main and sub paths', () => {
    expect(SWANN_PATH_TEMPLATES.map((t) => [t.name, t.mainPath(3), t.subPath(3)])).toEqual([
      ['/ch{NN}/0|1', '/ch03/0', '/ch03/1'],
      ['/cam/realmonitor?channel={N}&subtype=0|1', '/cam/realmonitor?channel=3&subtype=0', '/cam/realmonitor?channel=3&subtype=1'],
      ['/Streaming/Channels/{N}01|{N}02', '/Streaming/Channels/301', '/Streaming/Channels/302'],
    ]);
    expect(SWANN_PATH_TEMPLATES[0]!.mainPath(12)).toBe('/ch12/0');
  });
});

describe('probeSwann', () => {
  it('uses the first template that answers channel 1 and probes channels up to the first failure', async () => {
    const t2 = SWANN_PATH_TEMPLATES[1]!;
    const routes: Record<string, FakeRtspRoute> = {};
    for (const ch of [1, 2, 3, 4]) routes[t2.mainPath(ch)] = ok(ch === 2 ? 'H265' : 'H264');
    routes[t2.subPath(1)] = ok();
    routes[t2.mainPath(6)] = ok(); // after the gap at 5: never reached
    const port = await start(routes);

    const result = await probeSwann('127.0.0.1', creds, { port });

    expect(result.template).toBe(t2.name);
    expect(result.channels).toEqual([
      { channel: 1, mainPath: t2.mainPath(1), subPath: t2.subPath(1), codec: 'H264' },
      { channel: 2, mainPath: t2.mainPath(2), codec: 'H265' },
      { channel: 3, mainPath: t2.mainPath(3), codec: 'H264' },
      { channel: 4, mainPath: t2.mainPath(4), codec: 'H264' },
    ]);
    const described = server!.requests.filter((r) => r.headers.authorization).map((r) => r.url.replace(/^rtsp:\/\/[^/]+/, ''));
    expect(described[0]).toBe(SWANN_PATH_TEMPLATES[0]!.mainPath(1));
    expect(described).toContain(t2.mainPath(5));
    expect(described).not.toContain(t2.mainPath(6));
    expect(described.some((p) => p.startsWith('/Streaming'))).toBe(false);
  });

  it('ends the scan cleanly when the recorder drops the connection on a later channel', async () => {
    const t1 = SWANN_PATH_TEMPLATES[0]!;
    const routes: Record<string, FakeRtspRoute> = { [t1.mainPath(5)]: { status: 'drop' }, [t1.mainPath(6)]: ok() };
    for (const ch of [1, 2, 3, 4]) routes[t1.mainPath(ch)] = ok();
    const port = await start(routes);
    const result = await probeSwann('127.0.0.1', creds, { port });
    expect(result.channels.map((c) => c.channel)).toEqual([1, 2, 3, 4]);
  });

  it('records no sub stream when the sub path times out', async () => {
    const t1 = SWANN_PATH_TEMPLATES[0]!;
    const port = await start({ [t1.mainPath(1)]: ok('H265'), [t1.subPath(1)]: { status: 'hang' } });
    const result = await probeSwann('127.0.0.1', creds, { port, timeoutMs: 100 });
    expect(result.channels).toEqual([{ channel: 1, mainPath: t1.mainPath(1), codec: 'H265' }]);
  });

  it('caps the channel scan at 16', async () => {
    const t1 = SWANN_PATH_TEMPLATES[0]!;
    const routes: Record<string, FakeRtspRoute> = {};
    for (let ch = 1; ch <= 17; ch++) routes[t1.mainPath(ch)] = ok();
    const port = await start(routes);
    const result = await probeSwann('127.0.0.1', creds, { port });
    expect(result.channels.map((c) => c.channel)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it('throws SwannAuthError on a wrong password', async () => {
    const port = await start({ '/ch01/0': ok() });
    const wrong = `${PASSWORD}-wrong`;
    const err = await errorOf(probeSwann('127.0.0.1', { username: 'admin', password: wrong }, { port }));
    expect(err).toBeInstanceOf(SwannAuthError);
    expect(err.message).not.toContain(wrong);
    expect(err.message).not.toContain(PASSWORD);
  });

  it('throws SwannAuthError without sending credentials when the recorder offers only Basic', async () => {
    const port = await start({ '/ch01/0': ok() }, 'basic');
    const err = await errorOf(probeSwann('127.0.0.1', creds, { port }));
    expect(err).toBeInstanceOf(SwannAuthError);
    expect(err.message).toContain('unsupported or insecure authentication method');
    expect(server!.requests.some((r) => r.headers.authorization !== undefined)).toBe(false);
  });

  it('accepts Basic when allowBasic is set', async () => {
    const port = await start({ '/ch01/0': ok() }, 'basic');
    const result = await probeSwann('127.0.0.1', creds, { port, allowBasic: true });
    expect(result.channels.map((c) => c.channel)).toEqual([1]);
  });

  it('throws SwannUnreachableError when nothing listens', async () => {
    const port = await start({});
    await server!.close();
    server = undefined;
    const err = await errorOf(probeSwann('127.0.0.1', creds, { port }));
    expect(err).toBeInstanceOf(SwannUnreachableError);
    expect(err.message).not.toContain(PASSWORD);
  });

  it('throws SwannNoStreamsError when no template answers channel 1', async () => {
    const port = await start({});
    const err = await errorOf(probeSwann('127.0.0.1', creds, { port }));
    expect(err).toBeInstanceOf(SwannNoStreamsError);
    expect(err.message).not.toContain(PASSWORD);
  });
});

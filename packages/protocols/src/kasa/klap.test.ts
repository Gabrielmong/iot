import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeKasaDevice, type FakeKasaOptions } from '../test/fake-kasa-device.js';
import { KasaAuthError, KasaError } from './errors.js';
import { KlapCipher } from './klap-cipher.js';
import type { KlapHttpPost } from './klap-http.js';
import { KlapSession } from './klap.js';

const SYSINFO = { system: { get_sysinfo: {} } };

describe('KlapSession', () => {
  let device: FakeKasaDevice | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    await device?.close();
    device = undefined;
  });

  async function connect(opts: Partial<FakeKasaOptions> = {}, password = 'pw') {
    device = await FakeKasaDevice.start({ variant: 'v2', username: 'me@example.com', password: 'pw', ...opts });
    return new KlapSession({ ip: '127.0.0.1', port: device.port, username: 'me@example.com', password });
  }

  it.each(['v2', 'v1'] as const)('handshakes lazily with a %s device and sends the session cookie', async (variant) => {
    const session = await connect({ variant });
    expect(device!.log).toEqual([]);
    const res = await session.request<any>(SYSINFO);
    expect(res.system.get_sysinfo.err_code).toBe(0);
    const [h1, h2, req] = device!.log;
    expect(h1).toMatchObject({ path: '/app/handshake1', cookie: undefined, status: 200 });
    expect(h2!.path).toBe('/app/handshake2');
    expect(h2!.cookie).toMatch(/^TP_SESSIONID=[0-9A-F]{32}$/);
    expect(req).toMatchObject({ path: '/app/request', cookie: h2!.cookie, status: 200, json: SYSINFO });
  });

  it('reuses the session for later requests', async () => {
    const session = await connect();
    await session.request(SYSINFO);
    await session.request(SYSINFO);
    expect(device!.handshakeCount).toBe(1);
    expect(device!.requests).toHaveLength(2);
  });

  it('throws KasaAuthError for a wrong password, without sending handshake2', async () => {
    const session = await connect({}, 'wrong');
    await expect(session.request(SYSINFO)).rejects.toBeInstanceOf(KasaAuthError);
    expect(device!.log.map((e) => e.path)).toEqual(['/app/handshake1']);
  });

  it('re-handshakes and retries once when the device answers 403 mid-session', async () => {
    const session = await connect();
    await session.request(SYSINFO);
    device!.faults.push('forbidden');
    const res = await session.request<any>(SYSINFO);
    expect(res.system.get_sysinfo.err_code).toBe(0);
    expect(device!.handshakeCount).toBe(2);
  });

  it('gives up with KasaError when the retry is also refused', async () => {
    const session = await connect();
    device!.faults.push('forbidden', 'forbidden');
    await expect(session.request(SYSINFO)).rejects.toBeInstanceOf(KasaError);
    expect(device!.handshakeCount).toBe(2);
  });

  it.each(['error', 'corrupt'] as const)('drops the session after a failed request (%s) and re-handshakes on the next one', async (fault) => {
    const session = await connect();
    await session.request(SYSINFO);
    device!.faults.push(fault);
    await expect(session.request(SYSINFO)).rejects.toBeInstanceOf(KasaError);
    expect(device!.handshakeCount).toBe(1);
    const res = await session.request<any>(SYSINFO);
    expect(res.system.get_sysinfo.err_code).toBe(0);
    expect(device!.handshakeCount).toBe(2);
  });

  it('wraps seq from int32 max to min and keeps working', async () => {
    vi.spyOn(KlapCipher.prototype, 'initialSeq', 'get').mockReturnValue(0x7ffffffe);
    const session = await connect();
    for (let i = 0; i < 3; i++) await session.request(SYSINFO);
    const seqs = device!.log.filter((e) => e.path === '/app/request').map((e) => e.seq);
    expect(seqs).toEqual([0x7fffffff, -0x80000000, -0x7fffffff]);
    expect(device!.requests).toHaveLength(3);
  });

  it('re-handshakes when the session has expired per the TIMEOUT cookie', async () => {
    // python-kasa treats the session as expired 20 minutes before TIMEOUT; 1200 s expires at once.
    const session = await connect({ timeoutSeconds: 1200 });
    await session.request(SYSINFO);
    await session.request(SYSINFO);
    expect(device!.handshakeCount).toBe(2);
  });

  it('serializes concurrent requests so seq numbers never interleave', async () => {
    const session = await connect();
    const results = await Promise.all(Array.from({ length: 5 }, () => session.request<any>(SYSINFO)));
    expect(results.every((r) => r.system.get_sysinfo.err_code === 0)).toBe(true);
    expect(device!.handshakeCount).toBe(1);
    expect(device!.requests).toHaveLength(5);
  });

  it('reports an unreachable device as KasaError', async () => {
    const closed = await FakeKasaDevice.start({ variant: 'v2', username: 'u', password: 'p' });
    const port = closed.port;
    await closed.close();
    const session = new KlapSession({ ip: '127.0.0.1', port, username: 'u', password: 'p', timeoutMs: 1000 });
    await expect(session.request(SYSINFO)).rejects.toBeInstanceOf(KasaError);
  });

  it('uses the injected transport and port 80 by default', async () => {
    const urls: string[] = [];
    const httpPost: KlapHttpPost = async (url) => {
      urls.push(url);
      return { status: 500, body: Buffer.alloc(0), setCookies: [] };
    };
    const session = new KlapSession({ ip: '192.0.2.7', username: 'u', password: 'p', httpPost });
    await expect(session.request(SYSINFO)).rejects.toBeInstanceOf(KasaError);
    expect(urls).toEqual(['http://192.0.2.7:80/app/handshake1']);
  });

  it('sends the header name "Content-Length" with its exact casing (KP303 firmware rejects lowercase)', async () => {
    let seen: Record<string, string> = {};
    const httpPost: KlapHttpPost = async (_url, _body, headers) => {
      seen = headers;
      return { status: 500, body: Buffer.alloc(0), setCookies: [] };
    };
    const session = new KlapSession({ ip: '192.0.2.7', username: 'u', password: 'p', httpPost });
    await expect(session.request(SYSINFO)).rejects.toBeInstanceOf(KasaError);
    expect(Object.keys(seen)).toContain('Content-Length');
    expect(seen['Content-Length']).toBe('16');
  });
});

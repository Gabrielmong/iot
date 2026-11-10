import { describe, expect, it } from 'vitest';
import { signCloudRequest } from './cloud-sign.js';
import { isCloudAccountRefusal, TuyaCloud, TuyaCloudAuthError, TuyaCloudError, TuyaCloudExpiredError, TuyaCloudStreamUnavailableError } from './cloud.js';

type Call = { url: string; method: string; headers: Record<string, string>; body: string };

const token = { success: true, result: { access_token: 'tok', expire_time: 7200 } };
const STREAM_URL = 'rtsps://stream.tuya.example:443/secret-path?signInfo=abc';
const HLS_URL = 'https://stream.tuya.example/hls/secret-path.m3u8?signInfo=abc';

/** Fake fetch: the token request, then `reply` for the allocate call; records every call. */
function fakeFetch(reply: unknown | (() => unknown)) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : '',
    });
    const body = new URL(url).pathname.startsWith('/v1.0/token') ? token : typeof reply === 'function' ? reply() : reply;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const cloud = (impl: typeof fetch) => new TuyaCloud({ accessId: 'id', accessSecret: 'secret', region: 'eu', fetchImpl: impl });

describe('TuyaCloud.allocateStream', () => {
  it('posts the stream type to the allocate endpoint, signed over the body', async () => {
    const { impl, calls } = fakeFetch({ success: true, result: { url: STREAM_URL } });
    await expect(cloud(impl).allocateStream('dev 1', 'rtsp')).resolves.toEqual({ url: STREAM_URL, expiresInSec: 300 });

    const call = calls[1]!;
    expect(call.url).toBe('https://openapi.tuyaeu.com/v1.0/devices/dev%201/stream/actions/allocate');
    expect(call.method).toBe('POST');
    expect(JSON.parse(call.body)).toEqual({ type: 'rtsp' });
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.headers.access_token).toBe('tok');
    expect(call.headers.sign).toBe(
      signCloudRequest({
        accessId: 'id',
        accessSecret: 'secret',
        accessToken: 'tok',
        t: call.headers.t!,
        nonce: '',
        method: 'POST',
        path: '/v1.0/devices/dev%201/stream/actions/allocate',
        body: call.body,
      }),
    );
  });

  it('takes the lifetime from the reply when it has one', async () => {
    const { impl } = fakeFetch({ success: true, result: { url: HLS_URL, expire_time: 600 } });
    await expect(cloud(impl).allocateStream('d1', 'hls')).resolves.toEqual({ url: HLS_URL, expiresInSec: 600 });
  });

  it('clamps the lifetime to 30 s .. 3600 s', async () => {
    for (const [given, used] of [[1, 30], [29, 30], [30, 30], [3600, 3600], [3601, 3600], [86400, 3600]]) {
      const { impl } = fakeFetch({ success: true, result: { url: STREAM_URL, expire_time: given } });
      expect([given, (await cloud(impl).allocateStream('d1', 'rtsp')).expiresInSec]).toEqual([given, used]);
    }
  });

  it("keeps Tuya's error (class and code) as the cause, and tells account refusals apart", async () => {
    const cases = [
      [{ success: false, code: 1004, msg: 'sign invalid' }, TuyaCloudAuthError, 1004, true],
      [{ success: false, code: 28841105, msg: 'expired' }, TuyaCloudExpiredError, 28841105, true],
      [{ success: false, code: 2001, msg: 'device offline' }, TuyaCloudError, 2001, false],
    ] as const;
    for (const [reply, type, code, account] of cases) {
      const { impl } = fakeFetch(reply);
      const err = (await cloud(impl).allocateStream('d1', 'rtsp').catch((e: Error) => e)) as Error;
      expect(err).toBeInstanceOf(TuyaCloudStreamUnavailableError);
      expect(err.cause).toBeInstanceOf(type);
      expect((err.cause as { code?: number }).code).toBe(code);
      expect(isCloudAccountRefusal(err)).toBe(account);
    }
    expect(isCloudAccountRefusal(new TuyaCloudStreamUnavailableError())).toBe(false);
    expect(isCloudAccountRefusal(new TuyaCloudAuthError('x'))).toBe(true);
  });

  it('ignores a lifetime that is not a positive number', async () => {
    const { impl } = fakeFetch({ success: true, result: { url: HLS_URL, expire_time: 'soon' } });
    await expect(cloud(impl).allocateStream('d1', 'hls')).resolves.toEqual({ url: HLS_URL, expiresInSec: 300 });
  });

  it('throws TuyaCloudStreamUnavailableError when Tuya refuses', async () => {
    const { impl } = fakeFetch({ success: false, code: 28841101, msg: 'No permissions. This API is not subscribed.' });
    await expect(cloud(impl).allocateStream('d1', 'rtsp')).rejects.toBeInstanceOf(TuyaCloudStreamUnavailableError);
  });

  it('throws TuyaCloudStreamUnavailableError when the reply has no URL', async () => {
    const { impl } = fakeFetch({ success: true, result: {} });
    await expect(cloud(impl).allocateStream('d1', 'rtsp')).rejects.toBeInstanceOf(TuyaCloudStreamUnavailableError);
  });

  it('throws TuyaCloudStreamUnavailableError when the cloud is unreachable', async () => {
    const impl = (async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;
    await expect(cloud(impl).allocateStream('d1', 'rtsp')).rejects.toBeInstanceOf(TuyaCloudStreamUnavailableError);
  });

  it('never puts a stream URL into the error', async () => {
    const { impl } = fakeFetch({ success: true, result: { url: 42, note: STREAM_URL } });
    const err = (await cloud(impl).allocateStream('d1', 'rtsp').catch((e: Error) => e)) as Error;
    expect(err).toBeInstanceOf(TuyaCloudStreamUnavailableError);
    expect(err.message).not.toContain('secret-path');
  });

  it('accepts rtsp/rtsps URLs for rtsp and https URLs for hls', async () => {
    for (const [type, url] of [['rtsp', STREAM_URL], ['rtsp', 'rtsp://10.1.2.3:554/live'], ['hls', HLS_URL]] as const) {
      const { impl } = fakeFetch({ success: true, result: { url } });
      await expect(cloud(impl).allocateStream('d1', type)).resolves.toEqual({ url, expiresInSec: 300 });
    }
  });

  it('rejects URLs go2rtc could treat as another source, a modifier, or the wrong protocol', async () => {
    const bad: Array<['rtsp' | 'hls', string]> = [
      ['rtsp', 'exec:calc.exe'],
      ['rtsp', 'ffmpeg:rtsp://h/x#video=h264'],
      ['hls', 'exec:ffmpeg -i x'],
      ['rtsp', `${STREAM_URL}#backchannel=1`],
      ['hls', `${HLS_URL}#input=file`],
      ['rtsp', 'rtsps://h/x\n#exec'],
      ['rtsp', 'rtsps://h/a b'],
      ['rtsp', 'rtsps://h/a\tb'],
      ['rtsp', 'rtsps://h/a\u0000b'],
      ['rtsp', HLS_URL],
      ['hls', STREAM_URL],
      ['hls', 'http://stream.tuya.example/x.m3u8'],
      ['rtsp', 'not a url'],
    ];
    for (const [type, url] of bad) {
      const { impl } = fakeFetch({ success: true, result: { url } });
      const err = (await cloud(impl).allocateStream('d1', type).catch((e: Error) => e)) as Error;
      expect([type, url, err instanceof TuyaCloudStreamUnavailableError]).toEqual([type, url, true]);
      expect(err.message).not.toContain('stream.tuya.example');
    }
  });
});

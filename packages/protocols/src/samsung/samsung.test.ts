import { afterEach, describe, expect, it } from 'vitest';
import captured from '../test/fixtures/samsung-api-v2.json' with { type: 'json' };
import { FakeSamsungTv } from '../test/fake-samsung-tv.js';
import { CertificateMismatchError } from '../net/pinned-tls.js';
import { SamsungUnauthorizedError } from './errors.js';
import { fetchSamsungInfo, parseSamsungInfo } from './info.js';
import { SAMSUNG_KEYS } from './keys.js';
import { SamsungPairing, SamsungRemote } from './remote.js';

let tv: FakeSamsungTv | undefined;
afterEach(async () => {
  await tv?.close();
  tv = undefined;
});

const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('Samsung /api/v2/ info', () => {
  it('parses the JSON captured from the UN55NU7100 on 2026-11-09', () => {
    expect(parseSamsungInfo(captured)).toEqual({
      id: '8a36aaf0-536b-41b3-a5d2-86694337e408',
      name: '[TV] Tele cuarto',
      modelName: 'UN55NU7100',
      wifiMac: '9C:8C:6E:EC:7D:36',
      powerState: undefined,
    });
  });

  it('reads powerState and a wired MAC when present; rejects JSON without a device id', () => {
    const info = parseSamsungInfo({ device: { ...captured.device, wifiMac: undefined, wiredMac: 'AA:BB:CC:DD:EE:FF', PowerState: 'standby' } });
    expect(info).toMatchObject({ wifiMac: 'AA:BB:CC:DD:EE:FF', powerState: 'standby' });
    expect(() => parseSamsungInfo({ name: 'x' })).toThrow();
  });

  it('fetches it over HTTP', async () => {
    tv = await FakeSamsungTv.start();
    expect((await fetchSamsungInfo('127.0.0.1', { port: tv.infoPort })).id).toBe('8a36aaf0-536b-41b3-a5d2-86694337e408');
  });
});

describe('Samsung pairing', () => {
  it('resolves with the token the TV sends once someone accepts, and the TV certificate fingerprint', async () => {
    tv = await FakeSamsungTv.start({ issueToken: '12345678' });
    const pairing = await SamsungPairing.start('127.0.0.1', { port: tv.wsPort });
    await expect(pairing.finish()).resolves.toEqual({ token: '12345678', tvCertSha256: tv.certSha256 });
    expect(tv.clientNames).toEqual(['Home Control']);
  });

  it('keeps the TV answer when it comes before finish() is called (a TV that already allows the app)', async () => {
    tv = await FakeSamsungTv.start({ issueToken: '12345678' });
    const pairing = await SamsungPairing.start('127.0.0.1', { port: tv.wsPort });
    await new Promise((r) => setTimeout(r, 150)); // the fake answers after 20 ms
    await expect(pairing.finish()).resolves.toEqual({ token: '12345678', tvCertSha256: tv.certSha256 });
  }, 3000);

  it('throws SamsungUnauthorizedError when the prompt is denied', async () => {
    tv = await FakeSamsungTv.start({ onNoToken: 'deny' });
    const pairing = await SamsungPairing.start('127.0.0.1', { port: tv.wsPort });
    await expect(pairing.finish()).rejects.toBeInstanceOf(SamsungUnauthorizedError);
  });
});

describe('SamsungRemote', () => {
  it('connects with the token and sends keys and app launches as the TV expects', async () => {
    tv = await FakeSamsungTv.start({ validTokens: ['12345678'] });
    const fake = tv;
    const remote = await SamsungRemote.connect('127.0.0.1', { token: '12345678', tvCertSha256: fake.certSha256 }, { port: fake.wsPort });
    remote.sendKey(SAMSUNG_KEYS.VOLUME_UP);
    remote.launch('111299001912');
    await until(() => fake.received.length === 2);
    expect(fake.received[0]).toEqual({ method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: 'KEY_VOLUP', Option: 'false', TypeOfRemote: 'SendRemoteKey' } });
    expect(fake.received[1]).toEqual({ method: 'ms.channel.emit', params: { event: 'ed.apps.launch', to: 'host', data: { appId: '111299001912', action_type: 'DEEP_LINK' } } });
    const closed = new Promise((r) => remote.once('disconnected', r));
    fake.dropClients();
    await closed;
    expect(() => remote.sendKey('KEY_HOME')).toThrow();
  });

  it('a rejected token throws SamsungUnauthorizedError', async () => {
    tv = await FakeSamsungTv.start({ validTokens: ['12345678'] });
    await expect(SamsungRemote.connect('127.0.0.1', { token: 'stale', tvCertSha256: tv.certSha256 }, { port: tv.wsPort })).rejects.toBeInstanceOf(SamsungUnauthorizedError);
  });

  it('refuses another certificate before sending the token', async () => {
    tv = await FakeSamsungTv.start({ validTokens: ['12345678'] });
    await expect(SamsungRemote.connect('127.0.0.1', { token: '12345678', tvCertSha256: 'ab'.repeat(32) }, { port: tv.wsPort })).rejects.toBeInstanceOf(CertificateMismatchError);
    expect(tv.clientNames).toEqual([]);
  });
});

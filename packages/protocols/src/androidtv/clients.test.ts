import { afterEach, describe, expect, it } from 'vitest';
import vector from '../test/fixtures/androidtv-pairing.json' with { type: 'json' };
import { FakeAndroidTv } from '../test/fake-android-tv.js';
import { AndroidTvBadCodeError, AndroidTvNotPairedError, AndroidTvPairingFailedError, CertificateMismatchError } from './errors.js';
import { AndroidTvPairing } from './pairing-client.js';
import { AndroidTvRemote, remoteConnectError } from './remote-client.js';

const client = { certPem: vector.clientCertPem, keyPem: vector.clientKeyPem };
let tv: FakeAndroidTv | undefined;
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

const otherCheckByte = (code: string) => ((parseInt(code.slice(0, 2), 16) + 1) % 256).toString(16).padStart(2, '0') + code.slice(2);

describe('AndroidTvPairing', () => {
  it('pairs with the code the TV shows and returns the TV certificate fingerprint', async () => {
    tv = await FakeAndroidTv.start();
    const pairing = await AndroidTvPairing.start('127.0.0.1', client, { port: tv.pairingPort });
    expect(tv.showingCode).toMatch(/^[0-9A-F]{6}$/);
    const result = await pairing.finish(tv.showingCode!);
    expect(result.tvCertSha256).toBe(tv.certSha256);
    expect(tv.pairedClients).toBe(1);
  });

  it('a wrong code throws AndroidTvBadCodeError and keeps the exchange open for another try', async () => {
    tv = await FakeAndroidTv.start();
    const pairing = await AndroidTvPairing.start('127.0.0.1', client, { port: tv.pairingPort });
    const code = tv.showingCode!;
    await expect(pairing.finish(otherCheckByte(code))).rejects.toBeInstanceOf(AndroidTvBadCodeError);
    await expect(pairing.finish(code)).resolves.toMatchObject({ tvCertSha256: tv.certSha256 });
  });

  it('a TV that answers with an error status fails the pairing', async () => {
    tv = await FakeAndroidTv.start({ pairingStatus: 400 });
    await expect(AndroidTvPairing.start('127.0.0.1', client, { port: tv.pairingPort })).rejects.toBeInstanceOf(AndroidTvPairingFailedError);
  });
});

describe('AndroidTvRemote', () => {
  it('answers configure and pings, reports power, and sends keys and app links', async () => {
    tv = await FakeAndroidTv.start({ powerOn: true });
    const fake = tv;
    const remote = new AndroidTvRemote('127.0.0.1', { ...client, tvCertSha256: fake.certSha256 }, { port: fake.remotePort });
    const power: boolean[] = [];
    remote.on('power', (on: boolean) => power.push(on));
    await remote.connect();
    await until(() => power.length > 0);
    expect(power).toEqual([true]);
    expect(fake.received.some((m) => m.remoteConfigure)).toBe(true);
    expect(fake.received.some((m) => m.remoteSetActive)).toBe(true);

    fake.ping(42);
    await until(() => fake.received.some((m) => m.remotePingResponse?.val1 === 42));

    remote.sendKey(24);
    remote.launch('https://www.netflix.com/title');
    await until(() => fake.received.some((m) => m.remoteAppLinkLaunchRequest));
    expect(fake.received.find((m) => m.remoteKeyInject)?.remoteKeyInject).toEqual({ keyCode: 24, direction: 3 });
    expect(fake.received.find((m) => m.remoteAppLinkLaunchRequest)?.remoteAppLinkLaunchRequest?.appLink).toBe('https://www.netflix.com/title');

    const closed = new Promise((r) => remote.once('disconnected', r));
    fake.dropClients();
    await closed;
    expect(() => remote.sendKey(24)).toThrow();
  });

  it('reads a TLS alert refusing our certificate as AndroidTvNotPairedError; other errors pass through', () => {
    // Captured from a TV (192.168.0.139) after a connection with a certificate it never paired.
    const alert = Object.assign(new Error('sslv3 alert certificate unknown'), { code: 'ERR_SSL_SSLV3_ALERT_CERTIFICATE_UNKNOWN' });
    expect(remoteConnectError(alert)).toBeInstanceOf(AndroidTvNotPairedError);
    for (const code of ['ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE', 'ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED', 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA']) {
      expect(remoteConnectError(Object.assign(new Error(code), { code }))).toBeInstanceOf(AndroidTvNotPairedError);
    }
    const reset = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    expect(remoteConnectError(reset)).toBe(reset);
  });

  it('refuses a TV whose certificate is not the pinned one, before sending anything', async () => {
    tv = await FakeAndroidTv.start();
    const fake = tv;
    const remote = new AndroidTvRemote('127.0.0.1', { ...client, tvCertSha256: 'ab'.repeat(32) }, { port: fake.remotePort });
    await expect(remote.connect()).rejects.toBeInstanceOf(CertificateMismatchError);
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.received.some((m) => m.remoteConfigure)).toBe(false);
  });
});

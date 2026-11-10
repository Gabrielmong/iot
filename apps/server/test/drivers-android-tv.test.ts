import { EventEmitter } from "node:events";
import { AndroidTvBadCodeError, AndroidTvNotPairedError, AndroidTvPairingFailedError, CertificateMismatchError, type SsdpReply } from "@home/protocols";
import { afterEach, describe, expect, it } from "vitest";
import { AndroidTvDriver, type AndroidTvDriverOptions } from "../src/devices/drivers/android-tv.js";
import { DeviceNotReadyError, PairingRejectedError, WrongPairingCodeError } from "../src/devices/errors.js";
import { record, recordingContext } from "./driver-helpers.js";

const UUID = "0f6e3cac-1111-2222-3333-444455556666";
const DIAL = "urn:dial-multiscreen-org:service:dial:1";
const chromecast = (ip: string, uuid = UUID): SsdpReply => ({
  ip,
  server: "Linux/5.15.180-android14-11, UPnP/1.0, Chromecast/1.6.18",
  location: `http://${ip}:8008/ssdp/device-desc.xml`,
  usn: `uuid:${uuid}::${DIAL}`,
  st: DIAL,
});
const DESC = `<?xml version="1.0"?><root><device><friendlyName>Living room TV</friendlyName><modelName>Smart TV Pro</modelName><UDN>uuid:${UUID}</UDN></device></root>`;
const PAIRED = JSON.stringify({ certPem: "C", keyPem: "K", tvCertSha256: "ab".repeat(32) });

class FakeRemote extends EventEmitter {
  readonly keys: number[] = [];
  readonly links: string[] = [];
  connected = false;
  constructor(readonly host: string) {
    super();
  }
  async connect() {
    this.connected = true;
  }
  sendKey(code: number) {
    if (!this.connected) throw new Error("Not connected");
    this.keys.push(code);
  }
  launch(link: string) {
    this.links.push(link);
  }
  close() {
    this.connected = false;
  }
}

let driver: AndroidTvDriver | undefined;
afterEach(async () => {
  await driver?.stop();
  driver = undefined;
});

async function start(over: Partial<AndroidTvDriverOptions> = {}) {
  const ctx = recordingContext();
  const remotes: FakeRemote[] = [];
  driver = new AndroidTvDriver({
    search: async () => [],
    fetchText: async () => DESC,
    probe: async () => true,
    remote: (host) => {
      const r = new FakeRemote(host);
      remotes.push(r);
      return r;
    },
    discoveryIntervalMs: 3_600_000,
    backoff: { initialMs: 5, maxMs: 5 },
    ...over,
  });
  await driver.start(ctx);
  await tick(); // let the discovery start() runs settle, then forget it
  ctx.discoveredDevices.length = 0;
  return { ctx, remotes };
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const tv = (over = {}) => record({ brand: "ANDROID_TV", kind: "TV", externalId: UUID, ip: "192.168.0.163", secretPlain: PAIRED, ...over });

describe("AndroidTvDriver discovery", () => {
  it("reports Chromecast-based TVs that accept the remote port, by UUID, named from the device description", async () => {
    const probed: string[] = [];
    const replies = [chromecast("192.168.0.163"), chromecast("192.168.0.163"), chromecast("192.168.0.50", "other"), { ...chromecast("192.168.0.235", "samsung"), server: "Samsung-Linux/4.1, UPnP/1.0" }];
    const { ctx } = await start({
      search: async () => replies,
      probe: async (ip) => (probed.push(ip), ip === "192.168.0.163"),
    });
    probed.length = 0;
    await driver!.discoverNow!();
    expect(probed.sort()).toEqual(["192.168.0.163", "192.168.0.50"]);
    expect(ctx.discoveredDevices.at(-1)).toEqual({ brand: "ANDROID_TV", kind: "TV", externalId: UUID, ip: "192.168.0.163", name: "Living room TV", model: "Smart TV Pro" });
    expect(ctx.discoveredDevices.filter((d) => d.externalId === UUID)).toHaveLength(1);
  });

  it("fetches the description from the replying IP, whatever LOCATION says", async () => {
    const fetched: string[] = [];
    await start({
      search: async () => [{ ...chromecast("192.168.0.163"), location: "http://169.254.169.254/latest/meta-data" }],
      fetchText: async (url) => (fetched.push(url), DESC),
    });
    fetched.length = 0;
    await driver!.discoverNow!();
    expect(fetched).toEqual(["http://192.168.0.163:8008/ssdp/device-desc.xml"]);
  });

  it("a TV seen again at a new IP is reported with the same externalId", async () => {
    let ip = "192.168.0.163";
    const { ctx } = await start({ search: async () => [chromecast(ip)] });
    await driver!.discoverNow!();
    ip = "192.168.0.199";
    await driver!.discoverNow!();
    expect(ctx.discoveredDevices.map((d) => [d.externalId, d.ip])).toEqual([[UUID, "192.168.0.163"], [UUID, "192.168.0.199"]]);
  });

  it("identify(ip) reads the device description and checks the remote port", async () => {
    await start();
    expect(await driver!.identify!("192.168.0.163")).toMatchObject({ brand: "ANDROID_TV", kind: "TV", externalId: UUID, ip: "192.168.0.163", name: "Living room TV" });
    await driver!.stop();
    await start({ probe: async () => false });
    expect(await driver!.identify!("192.168.0.163")).toBeUndefined();
    await driver!.stop();
    await start({ fetchText: async () => Promise.reject(new Error("ECONNREFUSED")) });
    expect(await driver!.identify!("192.168.0.163")).toBeUndefined();
  });
});

describe("AndroidTvDriver control", () => {
  it("a TV without a stored pairing needs pairing and is never connected", async () => {
    const { ctx, remotes } = await start();
    const d = tv({ secretPlain: undefined });
    await driver!.sync([d]);
    expect(ctx.statuses).toEqual([{ deviceId: d.id, status: "NEEDS_PAIRING" }]);
    expect(remotes).toHaveLength(0);
    await expect(driver!.setState(d, { on: true })).rejects.toBeInstanceOf(DeviceNotReadyError);
  });

  it("follows the TV's power and only presses POWER when the state differs", async () => {
    const { ctx, remotes } = await start();
    const d = tv();
    await driver!.sync([d]);
    await tick();
    expect(remotes[0].host).toBe("192.168.0.163");
    expect(ctx.statuses).toContainEqual({ deviceId: d.id, status: "OK" });
    remotes[0].emit("power", true);
    expect(ctx.lastState(d.id)).toEqual({ online: true, on: true });
    await driver!.setState(d, { on: false });
    expect(remotes[0].keys).toEqual([26]);
    expect(ctx.lastState(d.id)).toEqual({ online: true, on: false });
    remotes[0].emit("power", false);
    await driver!.setState(d, { on: false });
    expect(remotes[0].keys).toEqual([26]);
  });

  it("sends remote keys and app links", async () => {
    const { remotes } = await start();
    const d = tv();
    await driver!.sync([d]);
    await tick();
    await driver!.tv!.sendKey(d, "VOLUME_UP");
    await driver!.tv!.launchApp(d, "NETFLIX");
    expect(remotes[0].keys).toEqual([24]);
    expect(remotes[0].links).toEqual(["https://www.netflix.com/title"]);
    expect(driver!.tv!.apps(d)).toEqual(["YOUTUBE", "NETFLIX", "PRIME_VIDEO", "DISNEY_PLUS", "SPOTIFY"]);
    expect(driver!.tv!.canPowerOn(d)).toBe(true);
  });

  it("reports offline on disconnect and reconnects", async () => {
    const { ctx, remotes } = await start();
    const d = tv();
    await driver!.sync([d]);
    await tick();
    remotes[0].connected = false;
    remotes[0].emit("disconnected");
    expect(ctx.lastState(d.id)).toEqual({ online: false });
    await expect(driver!.tv!.sendKey(d, "OK")).rejects.toThrow();
    await tick();
    expect(remotes).toHaveLength(2);
    expect(ctx.lastState(d.id)?.online).toBe(true);
  });
});

describe("AndroidTvDriver pinning", () => {
  it("a TV presenting another certificate needs pairing again", async () => {
    const { ctx, remotes } = await start({
      remote: (host) => {
        const r = new FakeRemote(host);
        r.connect = async () => Promise.reject(new CertificateMismatchError());
        remotes.push(r);
        return r;
      },
    });
    const d = tv();
    await driver!.sync([d]);
    await tick();
    expect(ctx.statuses).toContainEqual({ deviceId: d.id, status: "NEEDS_PAIRING" });
    expect(ctx.lastState(d.id)).toEqual({ online: false });
  });

  it("a TV whose pairing was removed on the TV needs pairing again", async () => {
    const { ctx, remotes } = await start({
      remote: (host) => {
        const r = new FakeRemote(host);
        r.connect = async () => Promise.reject(new AndroidTvNotPairedError());
        remotes.push(r);
        return r;
      },
    });
    const d = tv();
    await driver!.sync([d]);
    await tick();
    expect(ctx.statuses).toContainEqual({ deviceId: d.id, status: "NEEDS_PAIRING" });
  });
});

describe("AndroidTvDriver pairing", () => {
  it("pairs by code: a wrong code maps to WrongPairingCodeError, success gives the stored secret", async () => {
    let attempts = 0;
    await start({
      createCert: () => ({ certPem: "C", keyPem: "K" }),
      pairing: async (host) => {
        expect(host).toBe("192.168.0.163");
        return {
          finish: async (code: string) => {
            attempts++;
            if (code !== "ABC123") throw new AndroidTvBadCodeError();
            return { tvCertSha256: "cd".repeat(32) };
          },
          cancel: () => undefined,
        };
      },
    });
    const session = await driver!.tv!.startPairing(tv({ secretPlain: undefined }));
    expect(session.mode).toBe("CODE");
    await expect(session.finish("000000")).rejects.toBeInstanceOf(WrongPairingCodeError);
    expect(JSON.parse(await session.finish("ABC123"))).toEqual({ certPem: "C", keyPem: "K", tvCertSha256: "cd".repeat(32) });
    expect(attempts).toBe(2);
  });

  it("a pairing the TV ends maps to PairingRejectedError", async () => {
    await start({
      createCert: () => ({ certPem: "C", keyPem: "K" }),
      pairing: async () => ({ finish: async () => Promise.reject(new AndroidTvPairingFailedError("closed")), cancel: () => undefined }),
    });
    const session = await driver!.tv!.startPairing(tv({ secretPlain: undefined }));
    await expect(session.finish("ABC123")).rejects.toBeInstanceOf(PairingRejectedError);
  });
});

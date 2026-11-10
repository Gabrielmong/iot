import { EventEmitter } from "node:events";
import { SamsungPairingTimeoutError, SamsungUnauthorizedError, type SamsungInfo, type SsdpReply } from "@home/protocols";
import { afterEach, describe, expect, it } from "vitest";
import { SamsungDriver, type SamsungDriverOptions } from "../src/devices/drivers/samsung.js";
import { DeviceNotReadyError, PairingRejectedError } from "../src/devices/errors.js";
import { record, recordingContext } from "./driver-helpers.js";

const ID = "8a36aaf0-536b-41b3-a5d2-86694337e408";
const INFO: SamsungInfo = { id: ID, name: "[TV] Tele cuarto", modelName: "UN55NU7100", wifiMac: "9C:8C:6E:EC:7D:36" };
const samsungReply = (ip: string): SsdpReply => ({ ip, server: "Samsung-Linux/4.1, UPnP/1.0, Samsung_UPnP_SDK/1.0", location: `http://${ip}:9197/dmr`, usn: `uuid:${ID}::upnp:rootdevice`, st: "upnp:rootdevice" });
const PAIRED = JSON.stringify({ token: "12345678", tvCertSha256: "ab".repeat(32) });

class FakeRemote extends EventEmitter {
  readonly keys: string[] = [];
  readonly apps: string[] = [];
  isOpen = true;
  sendKey(key: string) {
    this.keys.push(key);
  }
  launch(appId: string) {
    this.apps.push(appId);
  }
  close() {
    this.isOpen = false;
  }
}

let driver: SamsungDriver | undefined;
afterEach(async () => {
  await driver?.stop();
  driver = undefined;
});

const tick = () => new Promise((r) => setTimeout(r, 20));

async function start(over: Partial<SamsungDriverOptions> = {}) {
  const ctx = recordingContext();
  const remotes: FakeRemote[] = [];
  const woken: string[] = [];
  driver = new SamsungDriver({
    search: async () => [],
    fetchInfo: async () => INFO,
    send: async (mac) => void woken.push(mac),
    connect: async () => {
      const r = new FakeRemote();
      remotes.push(r);
      return r;
    },
    pollIntervalMs: 3_600_000,
    discoveryIntervalMs: 3_600_000,
    ...over,
  });
  await driver.start(ctx);
  await tick();
  ctx.discoveredDevices.length = 0;
  return { ctx, remotes, woken };
}

const tv = (over = {}) => record({ brand: "SAMSUNG", kind: "TV", externalId: ID, ip: "192.168.0.235", config: { mac: "9c:8c:6e:ec:7d:36" }, secretPlain: PAIRED, ...over });

describe("SamsungDriver discovery", () => {
  it("reports Samsung TVs that answer /api/v2/, by duid, with the MAC normalised", async () => {
    const asked: string[] = [];
    const { ctx } = await start({
      search: async () => [samsungReply("192.168.0.235"), samsungReply("192.168.0.235"), samsungReply("192.168.0.77"), { ...samsungReply("192.168.0.5"), server: "Linux UPnP/1.0 HiSense" }],
      fetchInfo: async (ip) => {
        asked.push(ip);
        if (ip === "192.168.0.77") throw new Error("ECONNREFUSED"); // a pre-2016 Samsung
        return INFO;
      },
    });
    asked.length = 0;
    await driver!.discoverNow!();
    expect(asked.sort()).toEqual(["192.168.0.235", "192.168.0.77"]);
    expect(ctx.discoveredDevices).toEqual([{ brand: "SAMSUNG", kind: "TV", externalId: ID, ip: "192.168.0.235", name: "[TV] Tele cuarto", model: "UN55NU7100", config: { mac: "9c:8c:6e:ec:7d:36" } }]);
  });

  it("a TV seen again at a new IP keeps its id; identify(ip) uses the same check", async () => {
    let ip = "192.168.0.235";
    const { ctx } = await start({ search: async () => [samsungReply(ip)] });
    await driver!.discoverNow!();
    ip = "192.168.0.240";
    await driver!.discoverNow!();
    expect(ctx.discoveredDevices.map((d) => [d.externalId, d.ip])).toEqual([[ID, "192.168.0.235"], [ID, "192.168.0.240"]]);
    expect(await driver!.identify!("192.168.0.235")).toMatchObject({ brand: "SAMSUNG", externalId: ID });
    await driver!.stop();
    await start({ fetchInfo: async () => Promise.reject(new Error("timeout")) });
    expect(await driver!.identify!("192.168.0.235")).toBeUndefined();
  });
});

describe("SamsungDriver control", () => {
  it("a TV without a token needs pairing and is not polled", async () => {
    let polled = 0;
    const { ctx } = await start({ fetchInfo: async () => (polled++, INFO) });
    polled = 0;
    const d = tv({ secretPlain: undefined });
    await driver!.sync([d]);
    await tick();
    expect(ctx.statuses).toEqual([{ deviceId: d.id, status: "NEEDS_PAIRING" }]);
    expect(polled).toBe(0);
    await expect(driver!.setState(d, { on: true })).rejects.toBeInstanceOf(DeviceNotReadyError);
  });

  it("follows power by polling /api/v2/: no answer or standby is off", async () => {
    let answer: "on" | "standby" | "none" = "none";
    const { ctx } = await start({
      fetchInfo: async () => {
        if (answer === "none") throw new Error("timeout");
        return { ...INFO, powerState: answer === "standby" ? "standby" : undefined };
      },
    });
    const d = tv();
    await driver!.sync([d]);
    await tick();
    expect(ctx.lastState(d.id)).toEqual({ online: true, on: false });
    answer = "on";
    await driver!.setState(d, { on: true }); // ends with a fresh poll
    await tick();
    expect(ctx.lastState(d.id)).toEqual({ online: true, on: true });
    answer = "standby";
    await driver!.setState(d, { on: false }); // already "on" per the last poll: presses POWER
    await tick();
    expect(ctx.lastState(d.id)).toEqual({ online: true, on: false });
  });

  it("powers on by Wake-on-LAN to the stored MAC, and off with KEY_POWER only when on", async () => {
    let on = false;
    const { remotes, woken } = await start({ fetchInfo: async () => (on ? INFO : Promise.reject(new Error("timeout"))) });
    const d = tv();
    await driver!.sync([d]);
    await tick();
    await driver!.setState(d, { on: true });
    expect(woken).toEqual(["9c:8c:6e:ec:7d:36"]);
    await driver!.setState(d, { on: false });
    expect(remotes).toHaveLength(0); // off already: nothing pressed
    on = true;
    await driver!.setState(d, { on: true }); // still believed off: wakes again (harmless), then polls
    await tick();
    await driver!.setState(d, { on: false });
    expect(remotes[0].keys).toEqual(["KEY_POWER"]);
    expect(woken).toEqual(["9c:8c:6e:ec:7d:36", "9c:8c:6e:ec:7d:36"]);
  });

  it("sends keys and app launches over one reused channel; canPowerOn needs a MAC", async () => {
    const { remotes } = await start();
    const d = tv();
    await driver!.sync([d]);
    await driver!.tv!.sendKey(d, "VOLUME_UP");
    await driver!.tv!.launchApp(d, "YOUTUBE");
    expect(remotes).toHaveLength(1);
    expect(remotes[0].keys).toEqual(["KEY_VOLUP"]);
    expect(remotes[0].apps).toEqual(["111299001912"]);
    expect(driver!.tv!.apps(d)).toEqual(["YOUTUBE", "NETFLIX", "PRIME_VIDEO", "DISNEY_PLUS", "SPOTIFY"]);
    expect(driver!.tv!.canPowerOn(d)).toBe(true);
    expect(driver!.tv!.canPowerOn(tv({ config: {} }))).toBe(false);
    remotes[0].isOpen = false;
    remotes[0].emit("disconnected");
    await driver!.tv!.sendKey(d, "OK");
    expect(remotes).toHaveLength(2);
  });

  it("a token the TV rejects on connect means the TV needs pairing again", async () => {
    const { ctx } = await start({ connect: async () => Promise.reject(new SamsungUnauthorizedError()) });
    const d = tv();
    await driver!.sync([d]);
    await expect(driver!.tv!.sendKey(d, "OK")).rejects.toBeInstanceOf(DeviceNotReadyError);
    expect(ctx.statuses).toContainEqual({ deviceId: d.id, status: "NEEDS_PAIRING" });
  });
});

describe("SamsungDriver pairing", () => {
  it("pairs by accepting on the TV; a denied or unanswered prompt is a refusal", async () => {
    let outcome: "accept" | "deny" | "timeout" = "accept";
    await start({
      pair: async (host) => {
        expect(host).toBe("192.168.0.235");
        return {
          finish: async () => {
            if (outcome === "deny") throw new SamsungUnauthorizedError();
            if (outcome === "timeout") throw new SamsungPairingTimeoutError();
            return { token: "87654321", tvCertSha256: "cd".repeat(32) };
          },
          cancel: () => undefined,
        };
      },
    });
    const d = tv({ secretPlain: undefined });
    const session = await driver!.tv!.startPairing(d);
    expect(session.mode).toBe("ACCEPT_ON_TV");
    expect(JSON.parse(await session.finish())).toEqual({ token: "87654321", tvCertSha256: "cd".repeat(32) });
    outcome = "deny";
    await expect((await driver!.tv!.startPairing(d)).finish()).rejects.toBeInstanceOf(PairingRejectedError);
    outcome = "timeout";
    await expect((await driver!.tv!.startPairing(d)).finish()).rejects.toBeInstanceOf(PairingRejectedError);
  });
});

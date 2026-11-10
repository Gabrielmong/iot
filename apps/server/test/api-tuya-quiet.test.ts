import type { TuyaCloudDevice } from "@home/protocols";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { TuyaPresenceTarget } from "../src/devices/tuya-presence.js";
import { decryptSecret, encryptSecret } from "../src/secrets.js";
import { SettingKey } from "../src/settings-keys.js";
import { ApiHarness, KEY, type HarnessOptions } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const SYNC = `mutation { syncTuyaKeys { matched unmatched found } }`;
const bulb = (id: string, name: string, over: Partial<TuyaCloudDevice> = {}): TuyaCloudDevice => ({
  id,
  name,
  category: "dj",
  productId: "p",
  localKey: `key-${id}`.padEnd(16, "x"),
  online: true,
  ...over,
});

/** A LAN where `answers` maps ip → [externalId, version] of the device that really sits there. */
async function start(cloud: TuyaCloudDevice[], hosts: string[], answers: Record<string, [string, string]>, over: HarnessOptions = {}) {
  const presence = vi.fn(async (t: TuyaPresenceTarget) => {
    const real = answers[t.ip];
    return !!real && real[0] === t.externalId && real[1] === t.version && t.localKey === `key-${t.externalId}`.padEnd(16, "x");
  });
  h = await ApiHarness.start({ tuyaCloud: () => ({ listDevices: async () => cloud }), tuyaPortScan: async () => hosts, tuyaPresence: presence, ...over });
  await h.db.setting.createMany({
    data: [
      { key: SettingKey.tuyaAccessId, value: encryptSecret("id", KEY) },
      { key: SettingKey.tuyaAccessSecret, value: encryptSecret("secret", KEY) },
      { key: SettingKey.tuyaRegion, value: encryptSecret("eu", KEY) },
    ],
  });
  const token = (await h.user("Root", "ADMIN")).token;
  return { token, presence };
}

describe("Tuya sync finds devices that never broadcast", () => {
  it("adds an online cloud device found on the LAN with its key, ip and protocol version", async () => {
    const { token } = await start([bulb("bfquiet", "My lamp")], ["192.168.0.114"], { "192.168.0.114": ["bfquiet", "3.5"] });
    expect((await h.ok(token, SYNC)).syncTuyaKeys).toEqual({ matched: 1, unmatched: [], found: ["My lamp"] });
    const d = await h.db.device.findUniqueOrThrow({ where: { brand_externalId: { brand: "TUYA", externalId: "bfquiet" } } });
    expect(d).toMatchObject({ ip: "192.168.0.114", name: "My lamp", kind: "LIGHT", status: "OK", adopted: false });
    expect((d.config as { version: string }).version).toBe("3.5");
    expect(decryptSecret(d.secret!, KEY)).toBe("key-bfquiet".padEnd(16, "x"));
  });

  it("skips hosts that are already known devices and cloud devices that are offline", async () => {
    const { token, presence } = await start(
      [bulb("bfquiet", "Lamp"), bulb("bfoff", "Offline lamp", { online: false })],
      ["10.0.0.1", "192.168.0.230"],
      { "192.168.0.230": ["bfquiet", "3.4"] },
    );
    await h.device({ brand: "KASA", ip: "10.0.0.1" });
    expect((await h.ok(token, SYNC)).syncTuyaKeys).toEqual({ matched: 1, unmatched: ["Offline lamp"], found: ["Lamp"] });
    expect(presence.mock.calls.every(([t]) => t.ip === "192.168.0.230" && t.externalId === "bfquiet")).toBe(true);
  });

  it("leaves devices that broadcast to discovery and does not scan when nothing is missing", async () => {
    const scan = vi.fn(async () => ["192.168.0.50"]);
    const { token } = await start([bulb("bfloud", "Loud")], [], {}, { tuyaPortScan: scan });
    h.drivers.TUYA.discover({ brand: "TUYA", externalId: "bfloud", ip: "192.168.0.50", config: { version: "3.3" } });
    await h.manager.idle();
    expect((await h.ok(token, SYNC)).syncTuyaKeys).toEqual({ matched: 1, unmatched: [], found: [] });
    expect(scan).not.toHaveBeenCalled();
  });

  it("moves a known quiet device to its new address", async () => {
    const { token } = await start([bulb("bfquiet", "Lamp")], ["192.168.0.77"], { "192.168.0.77": ["bfquiet", "3.5"] });
    const id = await h.device({ brand: "TUYA", kind: "LIGHT", externalId: "bfquiet", ip: "192.168.0.114", config: { version: "3.5" } });
    expect((await h.ok(token, SYNC)).syncTuyaKeys).toMatchObject({ found: ["Lamp"] });
    expect(await h.db.device.findUniqueOrThrow({ where: { id } })).toMatchObject({ ip: "192.168.0.77", adopted: true });
  });

  it("shares one run between overlapping syncs", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const listDevices = async () => {
      calls++;
      await gate;
      return [bulb("bfloud", "Loud")];
    };
    const { token } = await start([], [], {}, { tuyaCloud: () => ({ listDevices }) });
    const first = h.ok(token, SYNC);
    const second = h.ok(token, SYNC);
    await vi.waitFor(() => expect(calls).toBe(1));
    release();
    expect((await first).syncTuyaKeys).toEqual((await second).syncTuyaKeys);
    expect(calls).toBe(1);
  });
});

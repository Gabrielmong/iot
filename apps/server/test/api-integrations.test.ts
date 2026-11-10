import { KasaAuthError, TuyaCloudAuthError } from "@home/protocols";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "../src/secrets.js";
import { SettingKey } from "../src/settings-keys.js";
import { ApiHarness, codes, KEY, silentLog, type HarnessOptions } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

async function admin(opts?: HarnessOptions) {
  h = await ApiHarness.start(opts);
  return (await h.user("Root", "ADMIN")).token;
}

async function storeTuyaCloud() {
  await h.db.setting.createMany({
    data: [
      { key: SettingKey.tuyaAccessId, value: encryptSecret("id", KEY) },
      { key: SettingKey.tuyaAccessSecret, value: encryptSecret("secret", KEY) },
      { key: SettingKey.tuyaRegion, value: encryptSecret("eu", KEY) },
    ],
  });
}

const SYNC = `mutation { syncTuyaKeys { matched unmatched } }`;
const SET_KEY = `mutation($id: ID!) { setTuyaLocalKey(deviceId: $id, localKey: "0123456789abcdef") { hasKey status } }`;

describe("credentials", () => {
  it("stores the TP-Link account encrypted, re-syncs drivers, and only reports that it is configured", async () => {
    const token = await admin();
    const syncs = h.drivers.KASA.synced.length;
    const r = await h.ok(token, `mutation { setKasaCredentials(username: "me@x.com", password: "hunter22") { kasaConfigured tuyaCloudConfigured } }`);
    expect(r.setKasaCredentials).toEqual({ kasaConfigured: true, tuyaCloudConfigured: false });
    const stored = await h.db.setting.findUniqueOrThrow({ where: { key: SettingKey.kasaPassword } });
    expect(stored.value).not.toContain("hunter22");
    expect(decryptSecret(stored.value, KEY)).toBe("hunter22");
    expect(h.drivers.KASA.synced.length).toBeGreaterThan(syncs);
  });

  it("runs Kasa discovery at once after saving TP-Link credentials", async () => {
    const token = await admin();
    const before = h.drivers.KASA.discoverNowCalls;
    await h.ok(token, `mutation { setKasaCredentials(username: "me@x.com", password: "pw") { kasaConfigured } }`);
    expect(h.drivers.KASA.discoverNowCalls).toBe(before + 1);
  });

  it("returns KASA_AUTH_FAILED when a discovered Kasa device rejects the new credentials, keeping them stored", async () => {
    const token = await admin();
    h.drivers.KASA.discoverNowReport = { authFailures: 1 };
    const r = await h.gql(token, `mutation { setKasaCredentials(username: "me@x.com", password: "wrong") { kasaConfigured } }`);
    expect(codes(r)).toEqual(["KASA_AUTH_FAILED"]);
    expect(JSON.stringify(r)).not.toContain("wrong");
    expect((await h.ok(token, `{ integrations { kasaConfigured } }`)).integrations).toEqual({ kasaConfigured: true });
  });

  it("validates the Tuya region and stores the cloud credentials encrypted", async () => {
    const token = await admin();
    const set = `mutation($r: String!) { setTuyaCloud(accessId: "aid", accessSecret: "s3cret", region: $r) { tuyaCloudConfigured } }`;
    expect(codes(await h.gql(token, set, { r: "mars" }))).toEqual(["BAD_USER_INPUT"]);
    expect((await h.ok(token, set, { r: "EU" })).setTuyaCloud).toEqual({ tuyaCloudConfigured: true });
    const rows = await h.db.setting.findMany();
    expect(JSON.stringify(rows)).not.toMatch(/s3cret|aid/);
    expect((await h.ok(token, `{ integrations { tuyaCloudConfigured kasaConfigured } }`)).integrations).toEqual({ tuyaCloudConfigured: true, kasaConfigured: false });
  });
});

describe("Tuya keys", () => {
  it("never returns a stored key, only hasKey", async () => {
    const token = await admin();
    const id = await h.device({ brand: "TUYA", kind: "LIGHT", status: "NEEDS_KEY" });
    expect((await h.ok(token, SET_KEY, { id })).setTuyaLocalKey).toEqual({ hasKey: true, status: "OK" });
    const res = await h.gql(token, `{ adminDevices { id hasKey } }`);
    expect(JSON.stringify(res)).not.toContain("0123456789abcdef");
  });

  it("raises the protocol version to a higher one seen on the LAN, but never lowers it", async () => {
    const token = await admin();
    const up = await h.device({ brand: "TUYA", kind: "LIGHT", externalId: "up", config: { version: "3.3" } });
    const down = await h.device({ brand: "TUYA", kind: "LIGHT", externalId: "down", config: { version: "3.4" } });
    h.drivers.TUYA.discover({ brand: "TUYA", externalId: "up", ip: "10.0.0.1", config: { version: "3.5" } });
    h.drivers.TUYA.discover({ brand: "TUYA", externalId: "down", ip: "10.0.0.2", config: { version: "3.1" } });
    await h.manager.idle();

    await h.ok(token, SET_KEY, { id: up });
    await h.ok(token, SET_KEY, { id: down });
    const version = async (id: string) => ((await h.db.device.findUniqueOrThrow({ where: { id } })).config as { version: string }).version;
    expect([await version(up), await version(down)]).toEqual(["3.5", "3.4"]);
  });

  it("marks devices whose cloud key is empty NEEDS_KEY", async () => {
    const token = await admin({
      tuyaCloud: () => ({ listDevices: async () => [{ id: "bf01", name: "Bulb", category: "dj", productId: "p", localKey: "" }] }),
    });
    await storeTuyaCloud();
    const id = await h.device({ brand: "TUYA", kind: "LIGHT", externalId: "bf01" });
    expect((await h.ok(token, SYNC)).syncTuyaKeys).toEqual({ matched: 1, unmatched: [] });
    expect(await h.db.device.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "NEEDS_KEY", secret: null });
  });

  it("requires cloud credentials and maps cloud auth failures", async () => {
    const token = await admin({ tuyaCloud: () => ({ listDevices: () => Promise.reject(new TuyaCloudAuthError("sign invalid")) }) });
    expect(codes(await h.gql(token, SYNC))).toEqual(["BAD_USER_INPUT"]);
    await storeTuyaCloud();
    expect(codes(await h.gql(token, SYNC))).toEqual(["TUYA_CLOUD_AUTH"]);
  });

  it("masks unexpected errors as INTERNAL_SERVER_ERROR and logs them server-side", async () => {
    const log = { ...silentLog, error: vi.fn() };
    const token = await admin({ log, tuyaCloud: () => ({ listDevices: () => Promise.reject(new Error("socket hang up at 10.1.2.3")) }) });
    await storeTuyaCloud();
    const r = await h.gql(token, SYNC);
    expect(codes(r)).toEqual(["INTERNAL_SERVER_ERROR"]);
    expect(JSON.stringify(r)).not.toContain("10.1.2.3");
    expect(log.error).toHaveBeenCalledWith("graphql: unexpected error", expect.objectContaining({ message: "socket hang up at 10.1.2.3" }));
  });
});

describe("addKasaByIp", () => {
  const ADD = `mutation($ip: String!) { addKasaByIp(ip: $ip) { name model ip adopted kind } }`;
  const storeKasa = () =>
    h.db.setting.createMany({
      data: [
        { key: SettingKey.kasaUsername, value: encryptSecret("me@x.com", KEY) },
        { key: SettingKey.kasaPassword, value: encryptSecret("pw", KEY) },
      ],
    });

  it("identifies the device with the stored account and records it as discovered", async () => {
    const probe = vi.fn(async (ip: string) => ({ brand: "KASA" as const, externalId: "8006ABC", ip, model: "KP303", name: "Strip", kind: "PLUG" as const }));
    const token = await admin({ kasaProbe: probe });
    expect(codes(await h.gql(token, ADD, { ip: "10.0.0.7" }))).toEqual(["BAD_USER_INPUT"]);
    await storeKasa();
    expect(codes(await h.gql(token, ADD, { ip: "not-an-ip" }))).toEqual(["BAD_USER_INPUT"]);

    expect((await h.ok(token, ADD, { ip: "10.0.0.7" })).addKasaByIp).toEqual({ name: "Strip", model: "KP303", ip: "10.0.0.7", adopted: false, kind: "PLUG" });
    expect(probe).toHaveBeenCalledWith("10.0.0.7", { username: "me@x.com", password: "pw" });
  });

  it("reports rejected credentials as NEEDS_CREDENTIALS and silence as DEVICE_UNREACHABLE", async () => {
    let fail: Error = new KasaAuthError("handshake1 hash mismatch");
    const log = { ...silentLog, warn: vi.fn() };
    const token = await admin({ log, kasaProbe: () => Promise.reject(fail) });
    await storeKasa();
    expect(codes(await h.gql(token, ADD, { ip: "10.0.0.7" }))).toEqual(["NEEDS_CREDENTIALS"]);
    fail = new Error("timeout");
    expect(codes(await h.gql(token, ADD, { ip: "10.0.0.7" }))).toEqual(["DEVICE_UNREACHABLE"]);
    expect(log.warn).toHaveBeenCalledWith("kasa: add by IP 10.0.0.7 failed", fail);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("me@x.com");
  });
});

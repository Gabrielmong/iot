import type { TuyaCloudDevice } from "@home/protocols";
import { getIntrospectionQuery, type IntrospectionQuery } from "graphql";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "../src/secrets.js";
import { SettingKey } from "../src/settings-keys.js";
import { ApiHarness, codes, KEY } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const DEVICES = `{ devices { id name state { online on } } }`;
const SET_STATE = `mutation($id: ID!) { setDeviceState(id: $id, patch: { on: true }) { id } }`;
const DEVICE_STATE = `subscription { deviceState { id state { on } } }`;

describe("device access", () => {
  it("shows a USER only the devices granted to them", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann");
    const d1 = await h.device({ name: "Lamp" });
    await h.device({ name: "Heater" });
    await h.grant(a.id, d1);

    const { devices } = await h.ok(a.token, DEVICES);
    expect(devices.map((d: { name: string }) => d.name)).toEqual(["Lamp"]);
  });

  it("forbids adminDevices for a USER", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann");
    expect(codes(await h.gql(a.token, `{ adminDevices { id } }`))).toEqual(["FORBIDDEN"]);
  });

  it("forbids setDeviceState on an ungranted device and runs it on a granted one", async () => {
    h = await ApiHarness.start();
    const a = await h.user("Ann");
    const granted = await h.device();
    const other = await h.device();
    await h.grant(a.id, granted);

    expect(codes(await h.gql(a.token, SET_STATE, { id: other }))).toEqual(["FORBIDDEN"]);
    expect(h.drivers.KASA.commands).toEqual([]);
    await h.ok(a.token, SET_STATE, { id: granted });
    expect(h.drivers.KASA.commands).toEqual([{ deviceId: granted, patch: { on: true } }]);
  });
});

describe("deviceState subscription", () => {
  it("delivers only granted devices and stops at once when a grant is revoked", async () => {
    h = await ApiHarness.start();
    const admin = await h.user("Root", "ADMIN");
    const a = await h.user("Ann");
    const d1 = await h.device();
    const d2 = await h.device();
    const sentinel = await h.device();
    await h.grant(a.id, d1, sentinel);

    const sub = await h.subscribe(h.wsClient(a.token), DEVICE_STATE);
    h.drivers.KASA.pushState(d2, { online: true, on: true });
    h.drivers.KASA.pushState(d1, { online: true, on: true });
    await sub.waitFor((e) => e.data.deviceState.id === d1);
    expect(sub.events.map((e) => e.data.deviceState.id)).toEqual([d1]);

    await h.ok(admin.token, `mutation($u: ID!, $d: [ID!]!) { setGrants(userId: $u, deviceIds: $d) }`, { u: a.id, d: [sentinel] });
    h.drivers.KASA.pushState(d1, { online: true, on: false });
    h.drivers.KASA.pushState(sentinel, { online: true, on: true });
    await sub.waitFor((e) => e.data.deviceState.id === sentinel);
    expect(sub.events.map((e) => e.data.deviceState.id)).toEqual([d1, sentinel]);
  });
});

describe("schema", () => {
  it("has no output field that could carry a key, secret, password, PIN or hash", async () => {
    h = await ApiHarness.start();
    const { __schema } = await h.ok<IntrospectionQuery>(null, getIntrospectionQuery());
    // Mutation fields are operations (e.g. syncTuyaKeys); what they return is checked via their types.
    const offending = __schema.types
      .filter((t) => !t.name.startsWith("__") && t.name !== "Mutation" && (t.kind === "OBJECT" || t.kind === "INTERFACE"))
      .flatMap((t) => ("fields" in t ? t.fields : []).map((f) => `${t.name}.${f.name}`))
      .filter((name) => /key|secret|password|pin|hash/i.test(name.split(".")[1]) && !["AdminDevice.hasKey", "User.hasPin", "Mutation.changeMyPin"].includes(name));
    expect(offending).toEqual([]);
  });
});

describe("syncTuyaKeys", () => {
  it("stores encrypted local keys, sets status OK and returns cloud devices never seen on the LAN", async () => {
    const cloud: TuyaCloudDevice[] = [
      { id: "bf01", name: "Hall bulb", category: "dj", productId: "p", localKey: "0123456789abcdef", dpSchema: { switch: "20" } as never },
      { id: "bf99", name: "Garage bulb", category: "dj", productId: "p", localKey: "fedcba9876543210" },
    ];
    let usedCreds: unknown;
    h = await ApiHarness.start({ tuyaCloud: (opts) => ((usedCreds = opts), { listDevices: async () => cloud }) });
    const admin = await h.user("Root", "ADMIN");
    await h.db.setting.createMany({
      data: [
        { key: SettingKey.tuyaAccessId, value: encryptSecret("access-id", KEY) },
        { key: SettingKey.tuyaAccessSecret, value: encryptSecret("access-secret", KEY) },
        { key: SettingKey.tuyaRegion, value: encryptSecret("eu", KEY) },
      ],
    });
    const id = await h.device({ brand: "TUYA", kind: "UNKNOWN", externalId: "bf01", status: "NEEDS_KEY", config: { version: "3.3" } });

    const { syncTuyaKeys } = await h.ok(admin.token, `mutation { syncTuyaKeys { matched unmatched } }`);

    expect(syncTuyaKeys).toEqual({ matched: 1, unmatched: ["Garage bulb"] });
    expect(usedCreds).toEqual({ accessId: "access-id", accessSecret: "access-secret", region: "eu" });
    const row = await h.db.device.findUniqueOrThrow({ where: { id } });
    expect(row.secret).not.toContain("0123456789abcdef");
    expect(decryptSecret(row.secret!, KEY)).toBe("0123456789abcdef");
    expect(row).toMatchObject({ status: "OK", kind: "LIGHT", config: { version: "3.3", dpSchema: { switch: "20" }, category: "dj" } });
    expect(h.drivers.TUYA.synced.at(-1)?.map((d) => d.secretPlain)).toEqual(["0123456789abcdef"]);
  });

  it("sets Tuya cameras (category sp) to stream from the cloud, backfilling only an unset source", async () => {
    const cloud: TuyaCloudDevice[] = [
      { id: "cam-new", name: "Nexxt", category: "sp", productId: "p", localKey: "k1" },
      { id: "cam-old", name: "Old cam", category: "sp", productId: "p", localKey: "k2" },
      { id: "cam-set", name: "Set cam", category: "sp", productId: "p", localKey: "k3" },
      { id: "bulb", name: "Bulb", category: "dj", productId: "p", localKey: "k4" },
    ];
    h = await ApiHarness.start({ tuyaCloud: () => ({ listDevices: async () => cloud }) });
    const admin = await h.user("Root", "ADMIN");
    await h.db.setting.createMany({
      data: [
        { key: SettingKey.tuyaAccessId, value: encryptSecret("access-id", KEY) },
        { key: SettingKey.tuyaAccessSecret, value: encryptSecret("access-secret", KEY) },
        { key: SettingKey.tuyaRegion, value: encryptSecret("eu", KEY) },
      ],
    });
    const fresh = await h.device({ brand: "TUYA", kind: "UNKNOWN", externalId: "cam-new", adopted: false });
    const adopted = await h.device({ brand: "TUYA", kind: "CAMERA", externalId: "cam-old" });
    const chosen = await h.device({ brand: "TUYA", kind: "CAMERA", externalId: "cam-set", streamSource: "LOCAL" });
    const bulb = await h.device({ brand: "TUYA", kind: "LIGHT", externalId: "bulb" });

    await h.ok(admin.token, `mutation { syncTuyaKeys { matched } }`);

    const source = async (id: string) => (await h.db.device.findUniqueOrThrow({ where: { id } })).streamSource;
    expect(await source(fresh)).toBe("CLOUD");
    expect(await source(adopted)).toBe("CLOUD");
    expect(await source(chosen)).toBe("LOCAL");
    expect(await source(bulb)).toBeNull();
  });
});

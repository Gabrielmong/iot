import type { CameraFeatures, TuyaCloudDevice } from "@home/protocols";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { encryptSecret } from "../src/secrets.js";
import { SettingKey } from "../src/settings-keys.js";
import { ApiHarness, KEY } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const SYNC = `mutation { syncTuyaKeys { matched unmatched } }`;
const PTZ: CameraFeatures = { ptz_control: { type: "enum", range: ["0", "2", "4", "6"] }, ptz_stop: { type: "bool" } };
const FLIP: CameraFeatures = { basic_flip: { type: "bool" } };

const cam = (over: Partial<TuyaCloudDevice> = {}): TuyaCloudDevice => ({
  id: "cam-1",
  name: "Cocina",
  category: "cdsxj",
  productId: "p",
  localKey: "0123456789abcdef",
  ...over,
});

/** A harness whose cloud answers with whatever `cloud.devices` holds at the time of each sync. */
async function start(devices: TuyaCloudDevice[]) {
  const cloud = { devices };
  h = await ApiHarness.start({ tuyaCloud: () => ({ listDevices: async () => cloud.devices }) });
  await h.db.setting.createMany({
    data: [
      { key: SettingKey.tuyaAccessId, value: encryptSecret("id", KEY) },
      { key: SettingKey.tuyaAccessSecret, value: encryptSecret("secret", KEY) },
      { key: SettingKey.tuyaRegion, value: encryptSecret("eu", KEY) },
    ],
  });
  const token = (await h.user("Root", "ADMIN")).token;
  const id = await h.device({ brand: "TUYA", kind: "CAMERA", externalId: "cam-1", config: { version: "3.4" } });
  return { token, id, cloud };
}

const config = async (id: string) => (await h.db.device.findUniqueOrThrow({ where: { id } })).config;

describe("Tuya key sync: camera features", () => {
  it("stores cameraFeatures in the camera's config", async () => {
    const { token, id } = await start([cam({ cameraFeatures: PTZ })]);
    await h.ok(token, SYNC);
    expect(await config(id)).toEqual({ version: "3.4", category: "cdsxj", cameraFeatures: PTZ });
  });

  it("keeps the stored features when a later sync has none", async () => {
    const { token, id, cloud } = await start([cam({ cameraFeatures: PTZ })]);
    await h.ok(token, SYNC);
    cloud.devices = [cam()];
    await h.ok(token, SYNC);
    expect(await config(id)).toMatchObject({ cameraFeatures: PTZ });
  });

  it("replaces the stored features with new ones", async () => {
    const { token, id, cloud } = await start([cam({ cameraFeatures: PTZ })]);
    await h.ok(token, SYNC);
    cloud.devices = [cam({ cameraFeatures: FLIP })];
    await h.ok(token, SYNC);
    expect((await config(id)) as Record<string, unknown>).toHaveProperty("cameraFeatures", FLIP);
  });

  it("records a cdsxj device as a CAMERA", async () => {
    const { token } = await start([cam({ id: "cam-2" })]);
    const id = await h.device({ brand: "TUYA", kind: "UNKNOWN", adopted: false, externalId: "cam-2", config: {} });
    await h.ok(token, SYNC);
    expect((await h.db.device.findUniqueOrThrow({ where: { id } })).kind).toBe("CAMERA");
  });
});

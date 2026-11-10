import { TuyaCloudAuthError, type CameraFeatures } from "@home/protocols";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "../src/secrets.js";
import { SettingKey } from "../src/settings-keys.js";
import { SAFETY_STOP_MS } from "../src/cameras/controls/watchdog.js";
import { ApiHarness, codes, KEY } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const FEATURES: CameraFeatures = {
  ptz_control: { type: "enum", range: ["0", "1", "2", "3", "4", "5", "6", "7"] },
  ptz_stop: { type: "bool" },
  ipc_preset_set: { type: "enum", range: ["1", "2", "3", "4"] },
  ipc_preset_action: { type: "enum", range: ["1", "2", "3", "4"] },
  basic_nightvision: { type: "enum", range: ["0", "1", "2"] },
  basic_private: { type: "bool" },
  basic_flip: { type: "bool" },
};
const VALUES = { basic_nightvision: "0", basic_private: false, basic_flip: true, ptz_control: "1" };

const CONTROLS = `query($id: ID!) { cameraControls(deviceId: $id) { deviceId pan presets { slot saved } supported settings { nightVision privacy flip followMotion } } }`;
const MOVE = `mutation($id: ID!, $d: PanDirection!) { moveCamera(deviceId: $id, direction: $d) }`;
const STOP = `mutation($id: ID!) { stopCamera(deviceId: $id) }`;
const GOTO = `mutation($id: ID!, $s: Int!) { gotoCameraPreset(deviceId: $id, slot: $s) }`;
const SAVE = `mutation($id: ID!, $s: Int!) { saveCameraPreset(deviceId: $id, slot: $s) { presets { slot saved } } }`;
const SET = `mutation($id: ID!, $s: CameraSettingsInput!) { setCameraSettings(deviceId: $id, settings: $s) { settings { nightVision privacy flip } } }`;

type Setup = { role?: "ADMIN" | "USER"; features?: CameraFeatures | null; read?: () => Promise<Record<string, unknown>>; issue?: (id: string, p: Record<string, unknown>) => Promise<void> };

async function start(opts: Setup = {}) {
  const issue = vi.fn(opts.issue ?? (async () => {}));
  const read = vi.fn(opts.read ?? (async () => VALUES));
  h = await ApiHarness.start({ tuyaCloud: () => ({ listDevices: async () => [], readCameraValues: read, issueCameraProperties: issue }) });
  await h.db.setting.createMany({
    data: [
      { key: SettingKey.tuyaAccessId, value: encryptSecret("id", KEY) },
      { key: SettingKey.tuyaAccessSecret, value: encryptSecret("secret", KEY) },
      { key: SettingKey.tuyaRegion, value: encryptSecret("us", KEY) },
    ],
  });
  const user = await h.user("U", opts.role ?? "USER");
  const features = opts.features === undefined ? FEATURES : opts.features;
  const cam = await h.device({ brand: "TUYA", kind: "CAMERA", externalId: "tuya-cam", config: features ? { cameraFeatures: features } : {} });
  if ((opts.role ?? "USER") === "USER") await h.grant(user.id, cam);
  return { token: user.token, cam, issue, read };
}

describe("cameraControls", () => {
  it("returns features and current values for a granted user", async () => {
    const { token, cam, read } = await start();
    const { cameraControls } = await h.ok(token, CONTROLS, { id: cam });
    expect(cameraControls).toEqual({
      deviceId: cam,
      pan: true,
      presets: [1, 2, 3, 4].map((slot) => ({ slot, saved: false })),
      supported: ["nightVision", "flip"],
      settings: { nightVision: "AUTO", privacy: false, flip: true, followMotion: null },
    });
    expect(read).toHaveBeenCalledWith("tuya-cam");
  });

  it("is null for a camera without features, and for one the user can't see", async () => {
    const { token, cam } = await start({ features: null });
    expect((await h.ok(token, CONTROLS, { id: cam })).cameraControls).toBeNull();
    const other = await h.device({ brand: "TUYA", kind: "CAMERA", externalId: "x", config: { cameraFeatures: FEATURES } });
    expect((await h.ok(token, CONTROLS, { id: other })).cameraControls).toBeNull();
  });

  it("returns settings null when the shadow read fails", async () => {
    const { token, cam } = await start({ read: async () => Promise.reject(new Error("down")) });
    const { cameraControls } = await h.ok(token, CONTROLS, { id: cam });
    expect(cameraControls.settings).toBeNull();
    expect(cameraControls.pan).toBe(true);
  });

  it("supported includes privacy for an admin", async () => {
    const { token, cam } = await start({ role: "ADMIN" });
    expect((await h.ok(token, CONTROLS, { id: cam })).cameraControls.supported).toEqual(["nightVision", "privacy", "flip"]);
  });
});

describe("moving", () => {
  it("moveCamera issues the PTZ value; stopCamera issues ptz_stop", async () => {
    const { token, cam, issue } = await start();
    expect((await h.ok(token, MOVE, { id: cam, d: "LEFT" })).moveCamera).toBe(true);
    expect((await h.ok(token, STOP, { id: cam })).stopCamera).toBe(true);
    expect(issue.mock.calls).toEqual([
      ["tuya-cam", { ptz_control: "6" }],
      ["tuya-cam", { ptz_stop: true }],
    ]);
  });

  it(
    "a move with no follow-up is stopped after SAFETY_STOP_MS",
    async () => {
      const { token, cam, issue } = await start();
      await h.ok(token, MOVE, { id: cam, d: "UP" });
      await vi.waitFor(() => expect(issue).toHaveBeenLastCalledWith("tuya-cam", { ptz_stop: true }), { timeout: SAFETY_STOP_MS + 2000, interval: 100 });
    },
    SAFETY_STOP_MS + 5000,
  );

  it("an ungranted user gets NOT_FOUND from moveCamera, and nothing is issued", async () => {
    const { token, issue } = await start();
    const other = await h.device({ brand: "TUYA", kind: "CAMERA", externalId: "x", config: { cameraFeatures: FEATURES } });
    expect(codes(await h.gql(token, MOVE, { id: other, d: "UP" }))).toEqual(["NOT_FOUND"]);
    expect(issue).not.toHaveBeenCalled();
  });

  it("a camera that can't pan gets BAD_USER_INPUT", async () => {
    const { token, cam } = await start({ features: { basic_flip: { type: "bool" } } });
    expect(codes(await h.gql(token, MOVE, { id: cam, d: "UP" }))).toEqual(["BAD_USER_INPUT"]);
  });

  it("a cloud auth failure maps to TUYA_CLOUD_AUTH", async () => {
    const { token, cam } = await start({ issue: async () => Promise.reject(new TuyaCloudAuthError("bad")) });
    expect(codes(await h.gql(token, STOP, { id: cam }))).toEqual(["TUYA_CLOUD_AUTH"]);
  });
});

describe("presets", () => {
  it("saveCameraPreset marks the slot saved; gotoCameraPreset issues the goto command", async () => {
    const { token, cam, issue } = await start();
    const { saveCameraPreset } = await h.ok(token, SAVE, { id: cam, s: 2 });
    expect(saveCameraPreset.presets).toEqual([1, 2, 3, 4].map((slot) => ({ slot, saved: slot === 2 })));
    await h.ok(token, GOTO, { id: cam, s: 2 });
    expect(issue.mock.calls).toEqual([
      ["tuya-cam", { ipc_preset_set: "2" }],
      ["tuya-cam", { ipc_preset_action: "2" }],
    ]);
  });

  it("rejects a slot outside 1-4", async () => {
    const { token, cam, issue } = await start();
    expect(codes(await h.gql(token, GOTO, { id: cam, s: 5 }))).toEqual(["BAD_USER_INPUT"]);
    expect(issue).not.toHaveBeenCalled();
  });
});

describe("settings", () => {
  it("issues the change and returns the values with the change applied", async () => {
    const { token, cam, issue } = await start();
    const { setCameraSettings } = await h.ok(token, SET, { id: cam, s: { nightVision: "ON", flip: false } });
    expect(issue).toHaveBeenCalledWith("tuya-cam", { basic_nightvision: "2", basic_flip: false });
    expect(setCameraSettings.settings).toEqual({ nightVision: "ON", privacy: false, flip: false });
  });

  it("a non-admin setting privacy gets FORBIDDEN and nothing is issued", async () => {
    const { token, cam, issue } = await start();
    expect(codes(await h.gql(token, SET, { id: cam, s: { privacy: true } }))).toEqual(["FORBIDDEN"]);
    expect(issue).not.toHaveBeenCalled();
  });

  it("an admin can set privacy", async () => {
    const { token, cam, issue } = await start({ role: "ADMIN" });
    await h.ok(token, SET, { id: cam, s: { privacy: true } });
    expect(issue).toHaveBeenCalledWith("tuya-cam", { basic_private: true });
  });

  it("a setting the camera lacks gets BAD_USER_INPUT", async () => {
    const { token, cam, issue } = await start();
    expect(codes(await h.gql(token, SET, { id: cam, s: { statusLight: true } }))).toEqual(["BAD_USER_INPUT"]);
    expect(issue).not.toHaveBeenCalled();
  });
});

/** A fake cloud where each call takes `delayFor(props)` ms and lands at the camera ("effects") only when it resolves. */
function slowCloud(delayFor: (p: Record<string, unknown>) => number, failFor: (p: Record<string, unknown>, n: number) => boolean = () => false) {
  const effects: Record<string, unknown>[] = [];
  let n = 0;
  const issue = async (_id: string, p: Record<string, unknown>) => {
    const call = n++;
    await new Promise((r) => setTimeout(r, delayFor(p)));
    if (failFor(p, call)) throw new Error("cloud down");
    effects.push(p);
  };
  return { effects, issue };
}
const isStop = (p: Record<string, unknown>) => "ptz_stop" in p;
const slow = SAFETY_STOP_MS + 6000;

describe("review fixes: the camera is never left moving", () => {
  it("a stop sent while a repeat move is still in flight is the last thing the camera gets", async () => {
    const cloud = slowCloud((p) => (isStop(p) ? 10 : 300));
    const { token, cam } = await start({ issue: cloud.issue });
    await h.ok(token, MOVE, { id: cam, d: "LEFT" });
    const repeat = h.ok(token, MOVE, { id: cam, d: "LEFT" });
    await h.ok(token, STOP, { id: cam });
    await repeat;
    await new Promise((r) => setTimeout(r, 400));
    expect(cloud.effects.at(-1)).toEqual({ ptz_stop: true });
  });

  it(
    "a stop that fails re-arms the safety stop",
    async () => {
      const cloud = slowCloud(() => 5, (p, call) => isStop(p) && call === 1);
      const { token, cam } = await start({ issue: cloud.issue });
      await h.ok(token, MOVE, { id: cam, d: "UP" });
      expect(codes(await h.gql(token, STOP, { id: cam }))).toHaveLength(1);
      await vi.waitFor(() => expect(cloud.effects.at(-1)).toEqual({ ptz_stop: true }), { timeout: SAFETY_STOP_MS + 3000, interval: 100 });
    },
    slow,
  );

  it(
    "a move whose reply fails still arms the safety stop",
    async () => {
      const issue = vi.fn(async (_id: string, p: Record<string, unknown>) => {
        if (!isStop(p)) throw new Error("reply lost");
      });
      const { token, cam } = await start({ issue });
      expect(codes(await h.gql(token, MOVE, { id: cam, d: "UP" }))).toHaveLength(1);
      await vi.waitFor(() => expect(issue).toHaveBeenLastCalledWith("tuya-cam", { ptz_stop: true }), { timeout: SAFETY_STOP_MS + 3000, interval: 100 });
    },
    slow,
  );

  it(
    "the safety stop retries when its first attempt fails",
    async () => {
      const cloud = slowCloud(() => 5, (p, call) => isStop(p) && call === 1);
      const { token, cam } = await start({ issue: cloud.issue });
      await h.ok(token, MOVE, { id: cam, d: "UP" });
      await vi.waitFor(() => expect(cloud.effects.at(-1)).toEqual({ ptz_stop: true }), { timeout: SAFETY_STOP_MS + 5000, interval: 100 });
    },
    slow + 2000,
  );
});

describe("review fixes: settings", () => {
  it("the reply shows the change even before the camera reports it", async () => {
    const { token, cam } = await start({ read: async () => ({ ...VALUES, basic_flip: true }) });
    const { setCameraSettings } = await h.ok(token, SET, { id: cam, s: { flip: false, nightVision: "OFF" } });
    expect(setCameraSettings.settings).toEqual({ nightVision: "OFF", privacy: false, flip: false });
  });
});

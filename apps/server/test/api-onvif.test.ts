import { OnvifAuthError, OnvifNoStreamError, OnvifUnreachableError, RtspTimeoutError, type OnvifProbeResult, type TuyaCloudDevice } from "@home/protocols";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { sdpWithVideo } from "../../../packages/protocols/src/test/fake-rtsp-server.js";
import { decryptSecret, encryptSecret } from "../src/secrets.js";
import { SettingKey } from "../src/settings-keys.js";
import type { OnvifProbe, RtspDescribe, TuyaPresence } from "../src/services/deps.js";
import { ApiHarness, codes, KEY, type HarnessOptions } from "./api-harness.js";
import { closeDb } from "./helpers.js";

let h: ApiHarness;
afterEach(() => h?.stop());
afterAll(closeDb);

const IP = "192.168.0.217";
const PASSWORD = "c0cina-pw!";
const LOCAL_KEY = "0123456789abcdef";
const FOUND: OnvifProbeResult = { port: 8000, main: `rtsp://admin:leak@${IP}:554/onvif1?a=1&b=2`, sub: `rtsp://${IP}:554/onvif2`, codec: "H264" };
const SET = `mutation($id: ID!, $u: String!, $p: String!, $c: String) { setCameraOnvif(deviceId: $id, username: $u, password: $p, confirmAddress: $c) { id connection streamSource } }`;
const CLEAR = `mutation($id: ID!) { clearCameraOnvif(deviceId: $id) { id connection streamSource } }`;

type Setup = { onvifProbe?: OnvifProbe; rtspDescribe?: RtspDescribe; tuyaPresence?: TuyaPresence; role?: "ADMIN" | "USER"; device?: Record<string, unknown> } & HarnessOptions;

async function start(opts: Setup = {}) {
  const lines: string[] = [];
  const capture = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  const onvifProbe = vi.fn(opts.onvifProbe ?? (async () => FOUND));
  const rtspDescribe = vi.fn(opts.rtspDescribe ?? (async () => ({ status: 200, sdp: sdpWithVideo("H265") })));
  const tuyaPresence = vi.fn(opts.tuyaPresence ?? (async () => true));
  h = await ApiHarness.start({ ...opts, onvifProbe, rtspDescribe, tuyaPresence, log: { info: capture, warn: capture, error: capture } });
  const user = await h.user("U", opts.role ?? "ADMIN");
  const cam = await h.device({
    brand: "TUYA",
    kind: "CAMERA",
    ip: IP,
    status: "OK",
    secret: encryptSecret(LOCAL_KEY, KEY),
    streamSource: "CLOUD",
    config: { category: "sp", version: "3.4" },
    ...opts.device,
  });
  const sourceChanged = vi.fn();
  h.cameraEvents.on("sourceChanged", sourceChanged);
  return { token: user.token, cam, onvifProbe, rtspDescribe, tuyaPresence, lines, sourceChanged };
}

const vars = (id: string, p = PASSWORD) => ({ id, u: " admin ", p });
const stored = (id: string) => h.db.device.findUniqueOrThrow({ where: { id } });

describe("setCameraOnvif", () => {
  it("probes the device IP, verifies the main stream with Digest, then stores and switches to LOCAL", async () => {
    const { token, cam, onvifProbe, rtspDescribe, tuyaPresence, sourceChanged } = await start();

    const { setCameraOnvif } = await h.ok(token, SET, vars(cam));

    const { externalId } = await stored(cam);
    expect(tuyaPresence).toHaveBeenCalledWith({ ip: IP, externalId, localKey: LOCAL_KEY, version: "3.4" });
    expect(setCameraOnvif).toEqual({ id: cam, connection: "LOCAL", streamSource: "LOCAL" });
    expect(onvifProbe).toHaveBeenCalledWith(IP, { username: "admin", password: PASSWORD });
    // The camera's userinfo is stripped; the login goes only as Digest (never Basic).
    expect(rtspDescribe).toHaveBeenCalledWith(`rtsp://${IP}:554/onvif1?a=1&b=2`, { username: "admin", password: PASSWORD });
    const row = await stored(cam);
    expect(row.streamSource).toBe("LOCAL");
    expect(row.config).toEqual({ category: "sp", version: "3.4", onvif: { host: IP, port: 554, mainPath: "/onvif1?a=1&b=2", subPath: "/onvif2", codec: "H265" } });
    const setting = await h.db.setting.findUniqueOrThrow({ where: { key: SettingKey.cameraOnvif(cam) } });
    expect(setting.value).not.toContain(PASSWORD);
    expect(JSON.parse(decryptSecret(setting.value, KEY))).toEqual({ username: "admin", password: PASSWORD });
    expect(sourceChanged).toHaveBeenCalledWith(cam);
    expect((await h.ok(token, `query($id: ID!) { device(id: $id) { connection } }`, { id: cam })).device.connection).toBe("LOCAL");
  });

  it("drops a sub stream on another host but keeps the main one", async () => {
    const { token, cam } = await start({ onvifProbe: async () => ({ ...FOUND, sub: "rtsp://10.9.9.9/sub" }) });
    await h.ok(token, SET, vars(cam));
    expect((await stored(cam)).config).toMatchObject({ onvif: { mainPath: "/onvif1?a=1&b=2" } });
    expect((await stored(cam)).config).not.toHaveProperty("onvif.subPath");
  });

  it.each([
    ["auth", { onvifProbe: async () => Promise.reject(new OnvifAuthError(IP)) }, "ONVIF_AUTH_FAILED"],
    ["unreachable", { onvifProbe: async () => Promise.reject(new OnvifUnreachableError(IP)) }, "ONVIF_UNREACHABLE"],
    ["no stream", { onvifProbe: async () => Promise.reject(new OnvifNoStreamError(IP)) }, "ONVIF_NO_STREAM"],
    ["main on another host", { onvifProbe: async () => ({ ...FOUND, main: "rtsp://10.9.9.9:554/onvif1" }) }, "ONVIF_NO_STREAM"],
    ["RTSP refuses the login", { rtspDescribe: async () => ({ status: 401 }) }, "ONVIF_AUTH_FAILED"],
    ["RTSP has no such stream", { rtspDescribe: async () => ({ status: 404 }) }, "ONVIF_NO_STREAM"],
    ["RTSP does not answer", { rtspDescribe: async () => Promise.reject(new RtspTimeoutError(`rtsp://${IP}:554/onvif1`, 3000)) }, "ONVIF_UNREACHABLE"],
  ] as [string, Setup, string][])("on %s fails with %s and stores nothing", async (_, setup, code) => {
    const { token, cam, lines, sourceChanged } = await start(setup);
    const before = await stored(cam);

    const r = await h.gql(token, SET, vars(cam));

    expect(codes(r)).toEqual([code]);
    expect(await h.db.setting.count()).toBe(0);
    expect(await stored(cam)).toEqual(before);
    expect(sourceChanged).not.toHaveBeenCalled();
    for (const text of [JSON.stringify(r), ...lines]) {
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain("rtsp://");
    }
  });

  it("never puts the password or an RTSP URL in a response or a log on success", async () => {
    const { token, cam, lines } = await start();
    const r = await h.gql(token, SET, vars(cam));
    for (const text of [JSON.stringify(r), ...lines]) {
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain("rtsp://");
    }
  });

  it("is admin only", async () => {
    const { token, cam, onvifProbe } = await start({ role: "USER" });
    expect(codes(await h.gql(token, SET, vars(cam)))).toEqual(["FORBIDDEN"]);
    expect(codes(await h.gql(token, CLEAR, { id: cam }))).toEqual(["FORBIDDEN"]);
    expect(onvifProbe).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-Tuya camera", { brand: "SWANN" }],
    ["a Tuya non-camera", { kind: "LIGHT" }],
    ["a camera without an IPv4 address", { ip: "cam.local" }],
  ])("rejects %s without probing", async (_, device) => {
    const { token, cam, onvifProbe } = await start({ device });
    expect(codes(await h.gql(token, SET, vars(cam)))).toEqual(["BAD_USER_INPUT"]);
    expect(onvifProbe).not.toHaveBeenCalled();
  });

  it.each([
    ["the camera is not confirmed at its IP (offline, or a spoofed address)", { tuyaPresence: async () => false }],
    ["the camera's Tuya status is not OK", { device: { status: "KEY_INVALID" } }],
    ["the camera has no local key", { device: { status: "NEEDS_KEY", secret: null } }],
  ] as [string, Setup][])("fails with ONVIF_CAMERA_NOT_CONFIRMED and sends nothing when %s", async (_, setup) => {
    const { token, cam, onvifProbe, rtspDescribe } = await start(setup);
    const r = await h.gql(token, SET, vars(cam));
    expect(codes(r)).toEqual(["ONVIF_CAMERA_NOT_CONFIRMED"]);
    expect(r.errors?.[0]?.message).toMatch(/Wait until the camera shows online/);
    expect(onvifProbe).not.toHaveBeenCalled();
    expect(rtspDescribe).not.toHaveBeenCalled();
    expect(await h.db.setting.count()).toBe(0);
  });

  describe("address confirmation", () => {
    it("rejects a 3.3 camera without it, before any probe (its presence reply can be replayed)", async () => {
      const { token, cam, onvifProbe, tuyaPresence } = await start({ device: { config: { category: "sp", version: "3.3" } } });
      const r = await h.gql(token, SET, vars(cam));
      expect(codes(r)).toEqual(["BAD_USER_INPUT"]);
      expect(r.errors?.[0]?.message).toMatch(/Confirm the camera's address/);
      expect(onvifProbe).not.toHaveBeenCalled();
      expect(tuyaPresence).not.toHaveBeenCalled();
    });

    it("lets a 3.3 camera proceed with the matching address", async () => {
      const { token, cam, onvifProbe, tuyaPresence } = await start({ device: { config: { category: "sp", version: "3.3" } } });
      await h.ok(token, SET, { ...vars(cam), c: ` ${IP} ` });
      expect(tuyaPresence).toHaveBeenCalled();
      expect(onvifProbe).toHaveBeenCalled();
    });

    it("lets a 3.5 camera proceed without it, after the local-key handshake", async () => {
      const { token, cam, onvifProbe, tuyaPresence } = await start({ device: { config: { category: "sp", version: "3.5" } } });
      await h.ok(token, SET, vars(cam));
      expect(tuyaPresence).toHaveBeenCalledWith(expect.objectContaining({ version: "3.5" }));
      expect(onvifProbe).toHaveBeenCalled();
    });

    it("refuses a Tuya 3.1 camera outright (plaintext status replies), even with a confirmation", async () => {
      const { token, cam, onvifProbe, tuyaPresence } = await start({ device: { config: { category: "sp", version: "3.1" } } });
      const r = await h.gql(token, SET, { ...vars(cam), c: IP });
      expect(codes(r)).toEqual(["BAD_USER_INPUT"]);
      expect(r.errors?.[0]?.message).toMatch(/3\.1/);
      expect(onvifProbe).not.toHaveBeenCalled();
      expect(tuyaPresence).not.toHaveBeenCalled();
    });

    it("rejects a confirmation that does not match the device IP, whatever the version", async () => {
      const { token, cam, onvifProbe, tuyaPresence } = await start();
      expect(codes(await h.gql(token, SET, { ...vars(cam), c: "192.168.0.99" }))).toEqual(["BAD_USER_INPUT"]);
      expect(onvifProbe).not.toHaveBeenCalled();
      expect(tuyaPresence).not.toHaveBeenCalled();
    });
  });

  it("requires a username and password", async () => {
    const { token, cam, onvifProbe } = await start();
    expect(codes(await h.gql(token, SET, { id: cam, u: " ", p: "x" }))).toEqual(["BAD_USER_INPUT"]);
    expect(codes(await h.gql(token, SET, { id: cam, u: "admin", p: "" }))).toEqual(["BAD_USER_INPUT"]);
    expect(onvifProbe).not.toHaveBeenCalled();
  });
});

describe("clearCameraOnvif", () => {
  it("deletes the login and config.onvif, reverts to CLOUD and cuts media", async () => {
    const { token, cam, sourceChanged } = await start();
    await h.ok(token, SET, vars(cam));
    sourceChanged.mockClear();

    expect((await h.ok(token, CLEAR, { id: cam })).clearCameraOnvif).toEqual({ id: cam, connection: "CLOUD", streamSource: "CLOUD" });

    expect(await h.db.setting.count()).toBe(0);
    expect((await stored(cam)).config).toEqual({ category: "sp", version: "3.4" });
    expect(sourceChanged).toHaveBeenCalledWith(cam);
  });
});

describe("with ONVIF configured", () => {
  it("a Tuya key sync leaves LOCAL and config.onvif alone", async () => {
    const cloud: TuyaCloudDevice[] = [{ id: "ext-cam", name: "Cocina", category: "sp", productId: "p", localKey: "k1" }];
    const { token, cam } = await start({ tuyaCloud: () => ({ listDevices: async () => cloud }), device: { externalId: "ext-cam" } });
    await h.db.setting.createMany({
      data: [
        { key: SettingKey.tuyaAccessId, value: encryptSecret("id", KEY) },
        { key: SettingKey.tuyaAccessSecret, value: encryptSecret("secret", KEY) },
        { key: SettingKey.tuyaRegion, value: encryptSecret("eu", KEY) },
      ],
    });
    await h.ok(token, SET, vars(cam));

    expect((await h.ok(token, `mutation { syncTuyaKeys { matched } }`)).syncTuyaKeys).toEqual({ matched: 1 });

    const row = await stored(cam);
    expect(row.streamSource).toBe("LOCAL");
    expect(row.config).toHaveProperty("onvif.mainPath", "/onvif1?a=1&b=2");
  });

  it("removing the camera deletes its ONVIF login", async () => {
    const { token, cam } = await start();
    await h.ok(token, SET, vars(cam));
    await h.db.setting.create({ data: { key: "kasa.username", value: encryptSecret("other", KEY) } });

    await h.ok(token, `mutation($id: ID!) { removeDevice(id: $id) }`, { id: cam });

    expect((await h.db.setting.findMany()).map((s) => s.key)).toEqual(["kasa.username"]);
  });
});

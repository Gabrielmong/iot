import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { trackReadiness } from "../src/cameras/go2rtc/ready-state.js";
import { CameraUnavailableError } from "../src/cameras/streams/errors.js";
import { StreamRegistry } from "../src/cameras/streams/registry.js";
import { goSource, rtspSourceUrl } from "../src/cameras/streams/source-url.js";
import { resolveBySource } from "../src/cameras/streams/resolve-by-source.js";
import { swannStreamResolver } from "../src/cameras/streams/swann-streams.js";
import type { SwannSettings } from "../src/devices/swann-settings.js";
import { record } from "./driver-helpers.js";

const HOST = "10.0.0.50";
const PASSWORD = "p@ss:w/rd#1";
const SETTINGS: SwannSettings = { host: HOST, creds: { username: "ad min", password: PASSWORD } };
const ENCODED_URL = (path: string) => `rtsp://ad%20min:p%40ss%3Aw%2Frd%231@10.0.0.50:554${path}`;

const camera = (over: Record<string, unknown> = {}) =>
  record({
    brand: "SWANN",
    kind: "CAMERA",
    externalId: `${HOST}:ch1`,
    ip: HOST,
    config: { channel: 1, mainPath: "/ch01/0", subPath: "/ch01/1", codec: "H264", ...over },
  });

function setup(opts: { ready?: boolean; settings?: SwannSettings | undefined; putFails?: boolean } = {}) {
  const lines: string[] = [];
  const capture = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  const log = { info: vi.fn(capture), warn: vi.fn(capture), error: vi.fn(capture) };
  const api = {
    putStream: vi.fn(async (_name: string, _src: string) => {
      if (opts.putFails) throw new Error("go2rtc PATCH /api/streams: ECONNREFUSED");
    }),
    deleteStream: vi.fn(async (_name: string) => {}),
  };
  let ready = opts.ready ?? true;
  const settings = "settings" in opts ? opts.settings : SETTINGS;
  const registry = new StreamRegistry({ api, resolve: swannStreamResolver(async () => settings, { check: async () => {} }), isReady: () => ready, log });
  return { registry, api, log, lines, setReady: (r: boolean) => (ready = r) };
}

describe("stream sources", () => {
  it("URL-encodes the login into the RTSP URL", () => {
    expect(rtspSourceUrl(HOST, SETTINGS.creds, "/ch01/0")).toBe(ENCODED_URL("/ch01/0"));
  });

  it("transcodes H265 through ffmpeg and passes H264 through", () => {
    expect(goSource("rtsp://h/x", "H265")).toBe("ffmpeg:rtsp://h/x#video=h264");
    expect(goSource("rtsp://h/x", "H264")).toBe("rtsp://h/x");
  });
});

const NAME = /^cam-[0-9a-f]{32}$/;

describe("StreamRegistry", () => {
  it("registers plain RTSP sources for an H264 camera under unguessable per-run names", async () => {
    const { registry, api } = setup();
    const cam = camera();

    const { live, thumb } = await registry.ensure(cam);

    expect(live).toMatch(NAME);
    expect(thumb).toBe(`${live}-sub`);
    expect(live).not.toContain(cam.id);
    expect(api.putStream.mock.calls).toEqual([
      [live, ENCODED_URL("/ch01/0")],
      [thumb, ENCODED_URL("/ch01/1")],
    ]);
  });

  it("keeps a device's names for the run, and each run (registry) picks new ones", async () => {
    const a = setup();
    const b = setup();
    const cam = camera();
    const first = await a.registry.ensure(cam);
    await a.registry.release(cam.id);
    expect(await a.registry.ensure(cam)).toEqual(first);
    expect(a.registry.streamNamesOf(cam.id)).toEqual([first.live, first.thumb]);

    const other = await b.registry.ensure(cam);
    expect(other.live).toMatch(NAME);
    expect(other.live).not.toBe(first.live);
    expect((await a.registry.ensure(camera())).live).not.toBe(first.live);
  });

  it("knows no names for a device it never registered", () => {
    expect(setup().registry.streamNamesOf("never")).toEqual([]);
  });

  it("registers ffmpeg H264 transcodes for an H265 camera", async () => {
    const { registry, api } = setup();
    const { live, thumb } = await registry.ensure(camera({ codec: "H265" }));

    expect(api.putStream.mock.calls).toEqual([
      [live, `ffmpeg:${ENCODED_URL("/ch01/0")}#video=h264`],
      [thumb, `ffmpeg:${ENCODED_URL("/ch01/1")}#video=h264`],
    ]);
  });

  it("uses the main stream for thumbnails when there is no sub stream", async () => {
    const { registry, api } = setup();
    const { live, thumb } = await registry.ensure(camera({ subPath: undefined }));

    expect(thumb).toBe(live);
    expect(api.putStream).toHaveBeenCalledTimes(1);
  });

  it("never logs the password or a stream name, even when registration fails", async () => {
    const ok = setup();
    const { live } = await ok.registry.ensure(camera());
    await ok.registry.reregisterAll();
    await ok.registry.release(camera().id);
    const failing = setup({ putFails: true });
    await expect(failing.registry.ensure(camera())).rejects.toBeInstanceOf(CameraUnavailableError);

    const logged = [...ok.lines, ...failing.lines].join("\n");
    expect(ok.lines.length + failing.lines.length).toBeGreaterThan(0);
    expect(logged).not.toContain("p@ss");
    expect(logged).not.toContain("p%40ss");
    expect(logged).not.toContain("rtsp://");
    expect(logged).not.toContain(live);
    expect(logged).not.toMatch(/cam-[0-9a-f]{32}/);
  });

  it("throws CameraUnavailableError without contacting go2rtc when it is not ready", async () => {
    const { registry, api } = setup({ ready: false });

    await expect(registry.ensure(camera())).rejects.toBeInstanceOf(CameraUnavailableError);
    expect(api.putStream).not.toHaveBeenCalled();
  });

  it("throws CameraUnavailableError when no recorder login is stored", async () => {
    const { registry } = setup({ settings: undefined });
    await expect(registry.ensure(camera())).rejects.toBeInstanceOf(CameraUnavailableError);
  });

  it("throws CameraUnavailableError for a camera without stream config", async () => {
    const { registry } = setup();
    await expect(registry.ensure(record({ brand: "SWANN", kind: "CAMERA", config: {} }))).rejects.toBeInstanceOf(CameraUnavailableError);
  });

  it("errors from a failed registration carry no source URL", async () => {
    const { registry } = setup({ putFails: true });
    const err = await registry.ensure(camera()).catch((e: unknown) => e);
    expect(String((err as Error).message)).not.toContain("rtsp");
    expect((err as Error).cause).toBeUndefined();
  });

  it("lists, re-registers and releases known streams", async () => {
    const { registry, api } = setup();
    const cam = camera();
    const { live, thumb } = await registry.ensure(cam);
    api.putStream.mockClear();

    expect([...registry.streams()].map((s) => s.name)).toEqual([live, thumb]);
    await registry.reregisterAll();
    expect(api.putStream.mock.calls.map(([name]) => name)).toEqual([live, thumb]);

    await registry.release(cam.id);
    expect(api.deleteStream.mock.calls).toEqual([[live], [thumb]]);
    expect([...registry.streams()]).toEqual([]);
  });

  it("reregisterAll does nothing while go2rtc is down", async () => {
    const { registry, api, setReady } = setup();
    await registry.ensure(camera());
    api.putStream.mockClear();
    setReady(false);

    await registry.reregisterAll();

    expect(api.putStream).not.toHaveBeenCalled();
  });

  it("refuses a source that go2rtc would treat as an alias of a stream", async () => {
    const { registry, api } = setup();
    const { live } = await registry.ensure(camera());
    api.putStream.mockClear();

    await expect(registry.ensure(camera({ mainPath: `/${live}` }))).rejects.toBeInstanceOf(CameraUnavailableError);
    expect(api.putStream).not.toHaveBeenCalled();
  });
});

describe("resolveBySource", () => {
  it("sends CLOUD cameras, and Tuya cameras with no source yet, to the cloud resolver; the rest stay local", async () => {
    const local = vi.fn(async () => ({ live: "rtsp://l" }));
    const cloud = vi.fn(async () => ({ live: "rtsps://c" }));
    const resolve = resolveBySource({ LOCAL: local, CLOUD: cloud });
    const routed = async (over: Parameters<typeof record>[0]) => {
      local.mockClear();
      cloud.mockClear();
      await resolve(record(over));
      return cloud.mock.calls.length ? "CLOUD" : "LOCAL";
    };

    expect(await routed({ brand: "TUYA", kind: "CAMERA", streamSource: "CLOUD" })).toBe("CLOUD");
    expect(await routed({ brand: "TUYA", kind: "CAMERA", streamSource: null })).toBe("CLOUD"); // seen after the last sync
    expect(await routed({ brand: "TUYA", kind: "CAMERA", streamSource: "LOCAL" })).toBe("LOCAL");
    expect(await routed({ brand: "TUYA", kind: "LIGHT", streamSource: null })).toBe("LOCAL");
    expect(await routed({ brand: "SWANN", kind: "CAMERA", streamSource: "LOCAL" })).toBe("LOCAL");
    expect(await routed({ brand: "SWANN", kind: "CAMERA", streamSource: null })).toBe("LOCAL");
  });
});

describe("trackReadiness", () => {
  it("follows the supervisor's ready and down events", () => {
    const supervisor = new EventEmitter();
    const state = trackReadiness(supervisor);
    expect(state.ready).toBe(false);
    supervisor.emit("ready");
    expect(state.ready).toBe(true);
    supervisor.emit("down");
    expect(state.ready).toBe(false);
  });
});

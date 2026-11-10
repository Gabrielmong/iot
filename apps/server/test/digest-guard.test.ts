import { rtspDescribe } from "@home/protocols";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { FakeRtspServer, sdpWithVideo } from "../../../packages/protocols/src/test/fake-rtsp-server.js";
import type { CameraServices } from "../src/cameras/camera-services.js";
import { DIGEST_CHECK_TTL_MS, DigestGuard } from "../src/cameras/streams/digest-guard.js";
import { CameraUnavailableError } from "../src/cameras/streams/errors.js";
import { onvifStreamResolver } from "../src/cameras/streams/onvif-streams.js";
import { StreamRegistry } from "../src/cameras/streams/registry.js";
import { swannStreamResolver } from "../src/cameras/streams/swann-streams.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { ApiHarness } from "./api-harness.js";
import { record } from "./driver-helpers.js";
import { closeDb } from "./helpers.js";

const PASSWORD = "Cam-s3cret!";
const CREDS = { username: "admin", password: PASSWORD };
let rtsp: FakeRtspServer | undefined;
let h: ApiHarness | undefined;

afterEach(async () => {
  await h?.stop();
  h = undefined;
  await rtsp?.close();
  rtsp = undefined;
});
afterAll(closeDb);

async function camera(scheme: "digest" | "basic" | "basic-then-digest") {
  const offerBasicFirst = scheme === "basic-then-digest";
  rtsp = await FakeRtspServer.start({ ...CREDS, scheme: offerBasicFirst ? "digest" : scheme, offerBasicFirst, routes: { "/onvif1": { status: 200, sdp: sdpWithVideo("H264") } } });
  const onvif = { host: "127.0.0.1", port: rtsp.port, mainPath: "/onvif1", codec: "H264" };
  return { onvif, device: record({ brand: "TUYA", kind: "CAMERA", streamSource: "LOCAL", config: { onvif } as Prisma.JsonObject }) };
}

function setup() {
  let clock = 1_000_000;
  const lines: string[] = [];
  const log = { info: vi.fn(), warn: vi.fn((...a: unknown[]) => void lines.push(a.map(String).join(" "))) };
  const guard = new DigestGuard({ describe: (url, creds) => rtspDescribe(url, creds, 1000), log, now: () => clock });
  const api = { putStream: vi.fn(async () => {}), deleteStream: vi.fn(async () => {}) };
  const registry = new StreamRegistry({ api, resolve: onvifStreamResolver(async () => CREDS, guard), isReady: () => true, log });
  return { registry, api, lines, advance: (ms: number) => (clock += ms) };
}

describe("DigestGuard", () => {
  it("refuses a Basic-only camera: nothing registered, no credentials sent, logs only the device id and error class", async () => {
    const { device } = await camera("basic");
    const { registry, api, lines } = setup();

    await expect(registry.ensure(device)).rejects.toBeInstanceOf(CameraUnavailableError);

    expect(api.putStream).not.toHaveBeenCalled();
    expect(rtsp!.requests.every((r) => r.headers.authorization === undefined)).toBe(true);
    expect(lines).toEqual([expect.stringContaining(device.id)]);
    expect(lines[0]).toContain("RtspAuthUnsupportedError");
    expect(lines.join(" ")).not.toMatch(/rtsp:\/\/|Cam-s3cret/);
  });

  it("refuses a camera that offers Basic before Digest (go2rtc answers only the first challenge)", async () => {
    const { device } = await camera("basic-then-digest");
    const { registry, api, lines } = setup();

    await expect(registry.ensure(device)).rejects.toBeInstanceOf(CameraUnavailableError);

    expect(api.putStream).not.toHaveBeenCalled();
    expect(lines).toEqual([expect.stringContaining(device.id)]);
    expect(lines[0]).toContain("Basic offered");
    expect(lines.join(" ")).not.toMatch(/rtsp:\/\/|Cam-s3cret/);
  });

  it("registers a Digest camera and trusts that for 10 minutes", async () => {
    const { device } = await camera("digest");
    const { registry, api, advance } = setup();
    const describes = () => rtsp!.requests.filter((r) => r.headers.authorization?.startsWith("Digest ")).length;

    await registry.ensure(device);
    expect(api.putStream).toHaveBeenCalled();
    expect(describes()).toBe(1);

    advance(DIGEST_CHECK_TTL_MS - 1);
    await registry.ensure(device);
    expect(describes()).toBe(1);

    advance(2);
    await registry.ensure(device);
    expect(describes()).toBe(2);
    expect(DIGEST_CHECK_TTL_MS).toBe(10 * 60_000);
  });

  it("fails closed on any check that does not answer 200 with Digest", async () => {
    for (const outcome of [async () => ({ status: 401 }), async () => ({ status: 404 }), async () => Promise.reject(new Error("timeout"))]) {
      const guard = new DigestGuard({ describe: outcome, log: { warn: () => {} } });
      await expect(guard.check("cam-1", "rtsp://127.0.0.1/x", CREDS)).rejects.toBeInstanceOf(CameraUnavailableError);
    }
  });

  it("also guards Swann channels, checking the login-free URL", async () => {
    const check = vi.fn(async () => Promise.reject(new CameraUnavailableError("no")));
    const resolve = swannStreamResolver(async () => ({ host: "10.0.0.50", creds: CREDS }), { check });
    const cam = record({ brand: "SWANN", kind: "CAMERA", config: { channel: 1, mainPath: "/ch01/0", codec: "H264" } });
    await expect(resolve(cam)).rejects.toBeInstanceOf(CameraUnavailableError);
    expect(check).toHaveBeenCalledWith(cam.id, "rtsp://10.0.0.50:554/ch01/0", CREDS);
  });

  it.each(["basic", "basic-then-digest"] as const)("makes the camera endpoints answer 503 for a %s camera", async (scheme) => {
    const { onvif } = await camera(scheme);
    const { registry, api } = setup();
    const cameras: CameraServices = {
      streams: registry,
      restartGo2rtc: () => {},
      go2rtc: { frameJpeg: vi.fn(), webrtcAnswer: vi.fn(), mseUrl: () => "ws://127.0.0.1:9/none", authHeaders: () => ({ authorization: "" }), streamInfo: async () => null },
    };
    h = await ApiHarness.start({ cameras });
    const root = await h.user("Root", "ADMIN");
    const cam = await h.device({ brand: "TUYA", kind: "CAMERA", streamSource: "LOCAL", config: { onvif } });

    const res = await fetch(`http://127.0.0.1:${h.server.port}/api/cameras/${cam}/thumbnail.jpg`, { headers: { authorization: `Bearer ${root.token}` } });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "CAMERA_UNAVAILABLE" });
    expect(api.putStream).not.toHaveBeenCalled();
  });
});

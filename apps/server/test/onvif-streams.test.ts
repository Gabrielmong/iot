import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../src/generated/prisma/client.js";
import { CameraUnavailableError } from "../src/cameras/streams/errors.js";
import { onvifStreamResolver } from "../src/cameras/streams/onvif-streams.js";
import { StreamRegistry } from "../src/cameras/streams/registry.js";
import { resolveByBrand } from "../src/cameras/streams/resolve-by-brand.js";
import { onvifRtspTarget } from "../src/services/onvif-rtsp-target.js";
import { record } from "./driver-helpers.js";

const IP = "192.168.0.217";
const CREDS = { username: "ad min", password: "p@ss:w/rd#1" };
const USERINFO = "ad%20min:p%40ss%3Aw%2Frd%231";
/** A Digest login check that passes (the guard has its own tests). */
const PASS = { check: async () => {} };

const camera = (onvif: Prisma.InputJsonObject | undefined, over: Record<string, unknown> = {}) =>
  record({ brand: "TUYA", kind: "CAMERA", ip: IP, streamSource: "LOCAL", config: { version: "3.3", ...(onvif ? { onvif } : {}) } as Prisma.JsonObject, ...over });

const ONVIF = { host: IP, port: 554, mainPath: "/onvif1?a=1&b=2", subPath: "/onvif2", codec: "H264" };

describe("onvifStreamResolver", () => {
  it("builds main and sub sources with the URL-encoded login and the stored RTSP port", async () => {
    const credsOf = vi.fn(async () => CREDS);
    const resolve = onvifStreamResolver(credsOf, PASS);
    expect(await resolve(camera({ ...ONVIF, port: 8554 }))).toEqual({
      live: `rtsp://${USERINFO}@${IP}:8554/onvif1?a=1&b=2`,
      sub: `rtsp://${USERINFO}@${IP}:8554/onvif2`,
    });
    expect(credsOf).toHaveBeenCalledWith(expect.any(String));
  });

  it("checks the login-free main URL with the guard before building sources", async () => {
    const check = vi.fn(async () => Promise.reject(new CameraUnavailableError("Basic only")));
    const device = camera({ ...ONVIF, port: 8554 });
    await expect(onvifStreamResolver(async () => CREDS, { check })(device)).rejects.toBeInstanceOf(CameraUnavailableError);
    expect(check).toHaveBeenCalledWith(device.id, `rtsp://${IP}:8554/onvif1?a=1&b=2`, CREDS);
  });

  it("transcodes H265 through ffmpeg and omits a missing sub", async () => {
    const resolve = onvifStreamResolver(async () => CREDS, PASS);
    const { subPath: _, ...noSub } = ONVIF;
    expect(await resolve(camera({ ...noSub, codec: "H265" }))).toEqual({ live: `ffmpeg:rtsp://${USERINFO}@${IP}:554/onvif1?a=1&b=2#video=h264` });
  });

  it.each([
    ["no ONVIF config", camera(undefined)],
    ["a malformed config", camera({ ...ONVIF, host: "evil.example" })],
    ["a non-Tuya device", camera(ONVIF, { brand: "SWANN" })],
  ])("is unavailable for %s", async (_, device) => {
    await expect(onvifStreamResolver(async () => CREDS, PASS)(device)).rejects.toBeInstanceOf(CameraUnavailableError);
  });

  it("is unavailable without a stored login", async () => {
    await expect(onvifStreamResolver(async () => undefined, PASS)(camera(ONVIF))).rejects.toBeInstanceOf(CameraUnavailableError);
  });

  it("is refused by the registry when its path would alias another stream", async () => {
    const api = { putStream: vi.fn(async () => {}), deleteStream: vi.fn(async () => {}) };
    const log = { info: vi.fn(), warn: vi.fn() };
    const registry = new StreamRegistry({ api, resolve: onvifStreamResolver(async () => CREDS, PASS), isReady: () => true, log });
    const { live } = await registry.ensure(camera(ONVIF));
    api.putStream.mockClear();
    await expect(registry.ensure(camera({ ...ONVIF, mainPath: `/${live}` }))).rejects.toBeInstanceOf(CameraUnavailableError);
    expect(api.putStream).not.toHaveBeenCalled();
    expect(JSON.stringify([log.info.mock.calls, log.warn.mock.calls])).not.toContain("rtsp://");
  });
});

describe("resolveByBrand", () => {
  it("routes by brand and refuses brands without a resolver", async () => {
    const swann = vi.fn(async () => ({ live: "s" }));
    const tuya = vi.fn(async () => ({ live: "t" }));
    const resolve = resolveByBrand({ SWANN: swann, TUYA: tuya });
    expect(await resolve(record({ brand: "SWANN" }))).toEqual({ live: "s" });
    expect(await resolve(record({ brand: "TUYA" }))).toEqual({ live: "t" });
    await expect(resolve(record({ brand: "KASA" }))).rejects.toBeInstanceOf(CameraUnavailableError);
  });
});

describe("onvifRtspTarget", () => {
  it("strips userinfo and keeps port, path and query", () => {
    expect(onvifRtspTarget(`rtsp://admin:secret@${IP}:8554/live/ch0?x=1`, IP)).toEqual({ port: 8554, path: "/live/ch0?x=1" });
    expect(onvifRtspTarget(`RTSP://${IP}/onvif1`, IP)).toEqual({ port: 554, path: "/onvif1" });
  });

  it.each([`rtsp://10.0.0.9/onvif1`, `http://${IP}/onvif1`, "not a url", `rtsp://${IP}.evil.example/x`])("rejects %s", (uri) => {
    expect(onvifRtspTarget(uri, IP)).toBeUndefined();
  });
});

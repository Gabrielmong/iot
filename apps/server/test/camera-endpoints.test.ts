import { TuyaCloudStreamUnavailableError } from "@home/protocols";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { createSession, SHARED_IDLE_MS } from "../src/auth/sessions.js";
import { CameraUnavailableError } from "../src/cameras/streams/errors.js";
import type { CameraServices } from "../src/cameras/camera-services.js";
import { Go2rtcHttpError, type StreamInfo } from "../src/cameras/go2rtc/api.js";
import { RESTART_WINDOW_MS } from "../src/cameras/streams/media-cut.js";
import { ApiHarness, type HarnessOptions } from "./api-harness.js";
import { closeDb } from "./helpers.js";
import { qualityOf } from "../src/cameras/http/stream-quality.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const UPSTREAM_AUTH = "Basic dGVzdDp0ZXN0";
const SECRET_URL = "rtsp://admin:hunter2@10.0.0.50:554/ch01/0";
const SET_DEVICE_GRANTS = `mutation($d: ID!, $u: [ID!]!) { setDeviceGrants(deviceId: $d, userIds: $u) }`;

/** A stand-in for go2rtc's MSE WebSocket: requires the API's Basic auth, echoes text and sends one binary frame. */
class FakeUpstream {
  readonly wss = new WebSocketServer({ port: 0, host: "127.0.0.1", verifyClient: (info: { req: IncomingMessage }) => info.req.headers.authorization === UPSTREAM_AUTH });
  readonly sockets: WebSocket[] = [];
  readonly received: string[] = [];
  readonly closed: WebSocket[] = [];

  constructor() {
    this.wss.on("connection", (ws) => {
      this.sockets.push(ws);
      ws.on("message", (data) => {
        this.received.push(data.toString());
        ws.send(`echo:${data.toString()}`);
      });
      ws.on("close", () => this.closed.push(ws));
      ws.send(Buffer.from([1, 2, 3]));
    });
  }

  get port(): number {
    return (this.wss.address() as AddressInfo).port;
  }

  close(): Promise<void> {
    for (const s of this.wss.clients) s.terminate();
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }
}

/**
 * Fake streaming: a registry that remembers what is registered, and a go2rtc that tracks consumers per
 * stream like the real one (a WebRTC answer adds "webrtc", an MSE stream "mse/fmp4"; deleting a stream
 * does not drop them; only a restart ends them, shortly after).
 */
/** The fake registry's per-run names: deliberately not `cam-<id>`, so code deriving names itself would miss them. */
const LIVE = (deviceId: string) => `cam-run7-${deviceId}`;
const SUB = (deviceId: string) => `${LIVE(deviceId)}-sub`;

function fakeCameras(upstream: FakeUpstream) {
  const registered = new Set<string>();
  const named = new Set<string>();
  const consumerMap = new Map<string, string[]>();
  const addConsumer = (name: string, format: string) => consumerMap.set(name, [...(consumerMap.get(name) ?? []), format]);
  const streams = {
    ensure: vi.fn(async (device: { id: string }) => {
      registered.add(device.id);
      named.add(device.id);
      return { live: LIVE(device.id), thumb: SUB(device.id) };
    }),
    streamNamesOf: vi.fn((deviceId: string) => (named.has(deviceId) ? [LIVE(deviceId), SUB(deviceId)] : [])),
    release: vi.fn(async (deviceId: string) => void registered.delete(deviceId)),
    deviceIds: vi.fn(() => [...registered]),
  };
  const go2rtc = {
    frameJpeg: vi.fn(async (_name: string) => JPEG),
    webrtcAnswer: vi.fn(async (name: string, _offer: string) => {
      addConsumer(name, "webrtc");
      return "v=0\r\nanswer\r\n";
    }),
    mseUrl: vi.fn((name: string) => {
      addConsumer(name, "mse/fmp4");
      return `ws://127.0.0.1:${upstream.port}/api/ws?src=${encodeURIComponent(name)}`;
    }),
    authHeaders: vi.fn(() => ({ authorization: UPSTREAM_AUTH })),
    streamInfo: vi.fn(async (name: string): Promise<StreamInfo | null> => ({
      producers: [],
      consumers: (consumerMap.get(name) ?? []).map((formatName) => ({ formatName })),
    })),
  };
  // Like a real restart, the media ends a moment later, not synchronously.
  const restartGo2rtc = vi.fn(() => void setTimeout(() => consumerMap.clear(), 100));
  return {
    streams,
    go2rtc,
    restartGo2rtc,
    addConsumer,
    consumers: (name: string) => consumerMap.get(name) ?? [],
    clearConsumers: (name: string) => void consumerMap.delete(name),
  } satisfies CameraServices & Record<string, unknown>;
}

let h: ApiHarness;
let upstream: FakeUpstream;
let cams: ReturnType<typeof fakeCameras>;
const sockets: WebSocket[] = [];

beforeEach(() => {
  upstream = new FakeUpstream();
  cams = fakeCameras(upstream);
});
afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await h?.stop();
  await upstream.close();
});
afterAll(closeDb);

async function start(opts: HarnessOptions = {}) {
  h = await ApiHarness.start({ cameras: cams, mseAuthTimeoutMs: 300, ...opts });
  const root = await h.user("Root", "ADMIN");
  const ann = await h.user("Ann");
  const cam = await h.device({ brand: "SWANN", kind: "CAMERA", name: "Porch" });
  return { root, ann, cam };
}

const base = () => `http://127.0.0.1:${h.server.port}/api/cameras`;

function thumbnail(token: string | null, id: string, headers: Record<string, string> = {}) {
  return fetch(`${base()}/${id}/thumbnail.jpg`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
}

function webrtc(token: string | null, id: string, offer = "v=0\r\noffer\r\n") {
  return fetch(`${base()}/${id}/webrtc`, {
    method: "POST",
    headers: { "content-type": "application/sdp", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: offer,
  });
}

/** An MSE client socket that records messages and how it closed. */
function mse(id: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${h.server.port}/api/cameras/${id}/mse`);
  sockets.push(ws);
  const messages: string[] = [];
  const binary: Buffer[] = [];
  let close: { code: number; reason: string } | undefined;
  ws.on("message", (data, isBinary) => (isBinary ? binary.push(data as Buffer) : messages.push(data.toString())));
  ws.on("close", (code, reason) => (close = { code, reason: reason.toString() }));
  ws.on("error", () => {});
  const opened = new Promise<void>((resolve) => ws.once("open", () => resolve()));
  return {
    ws,
    messages,
    binary,
    get close() {
      return close;
    },
    async auth(token: string) {
      await opened;
      ws.send(JSON.stringify({ authToken: token }));
    },
    async closed() {
      await vi.waitFor(() => expect(close).toBeDefined(), { timeout: 2000 });
      return close!;
    },
  };
}

/** Opens an authorised MSE stream and waits until it is piped to the upstream. */
async function liveMse(token: string, id: string) {
  const client = mse(id);
  await client.auth(token);
  await vi.waitFor(() => expect(client.binary).toHaveLength(1));
  return client;
}

describe("camera endpoint authorisation", () => {
  it("answers an ungranted USER with 404 on all three endpoints and never touches go2rtc", async () => {
    const { ann, cam } = await start();

    expect((await thumbnail(ann.token, cam)).status).toBe(404);
    expect((await webrtc(ann.token, cam)).status).toBe(404);
    const client = mse(cam);
    await client.auth(ann.token);
    expect((await client.closed()).code).toBe(4404);

    expect(cams.streams.ensure).not.toHaveBeenCalled();
    expect(cams.go2rtc.frameJpeg).not.toHaveBeenCalled();
    expect(cams.go2rtc.webrtcAnswer).not.toHaveBeenCalled();
    expect(upstream.sockets).toHaveLength(0);
  });

  it("answers 401 / closes 4401 without a valid session", async () => {
    const { cam } = await start();
    expect((await thumbnail(null, cam)).status).toBe(401);
    expect((await thumbnail("bogus", cam)).status).toBe(401);
    expect((await webrtc("bogus", cam)).status).toBe(401);
    const client = mse(cam);
    await client.auth("bogus");
    expect((await client.closed()).code).toBe(4401);
  });

  it("closes an MSE socket with 4401 when the first message is missing or malformed", async () => {
    const { cam } = await start();
    const silent = mse(cam);
    expect((await silent.closed()).code).toBe(4401);

    const garbled = mse(cam);
    await vi.waitFor(() => expect(garbled.ws.readyState).toBe(WebSocket.OPEN));
    garbled.ws.send("not json");
    expect((await garbled.closed()).code).toBe(4401);
  });

  it("treats a non-camera device as not found, even for an admin", async () => {
    const { root } = await start();
    const plug = await h.device();
    expect((await thumbnail(root.token, plug)).status).toBe(404);
    expect((await webrtc(root.token, plug)).status).toBe(404);
  });

  it("serves a granted USER and an admin", async () => {
    const { root, ann, cam } = await start();
    await h.grant(ann.id, cam);
    expect((await thumbnail(ann.token, cam)).status).toBe(200);
    expect((await thumbnail(root.token, cam)).status).toBe(200);
  });

  it("does not slide the session for a background thumbnail request", async () => {
    const { ann, cam } = await start();
    await h.grant(ann.id, cam);
    const before = await h.db.session.findFirstOrThrow({ where: { userId: ann.id } });
    h.advance(60_000);
    expect((await thumbnail(ann.token, cam, { "x-home-background": "1" })).status).toBe(200);
    expect((await h.db.session.findFirstOrThrow({ where: { userId: ann.id } })).expiresAt).toEqual(before.expiresAt);
    expect((await thumbnail(ann.token, cam)).status).toBe(200);
    expect((await h.db.session.findFirstOrThrow({ where: { userId: ann.id } })).expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime());
  });
});

describe("thumbnails", () => {
  it("grabs one frame per 10 s and reports its age in X-Frame-Age", async () => {
    const { root, cam } = await start();

    const first = await thumbnail(root.token, cam);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/jpeg");
    expect(first.headers.get("x-frame-age")).toBe("0");
    expect(Buffer.from(await first.arrayBuffer())).toEqual(JPEG);
    expect(cams.go2rtc.frameJpeg).toHaveBeenCalledWith(SUB(cam));

    h.advance(4_000);
    const second = await thumbnail(root.token, cam);
    expect(second.headers.get("x-frame-age")).toBe("4");
    expect(cams.go2rtc.frameJpeg).toHaveBeenCalledTimes(1);

    h.advance(7_000); // 11 s after the grab
    const third = await thumbnail(root.token, cam);
    expect(third.headers.get("x-frame-age")).toBe("0");
    expect(cams.go2rtc.frameJpeg).toHaveBeenCalledTimes(2);
  });

  it("answers 503 when no frame can be had, and caches no failure", async () => {
    const { root, cam } = await start();
    cams.go2rtc.frameJpeg.mockRejectedValueOnce(new Error(`go2rtc failed for ${SECRET_URL}`));
    const res = await thumbnail(root.token, cam);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("rtsp://");
    expect((await thumbnail(root.token, cam)).status).toBe(200);
  });
});

describe("WebRTC signalling", () => {
  it("logs why signalling failed (go2rtc status and safe error text), never a URL", async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
    const { root, cam } = await start({ log: { info: capture, warn: capture, error: capture } });
    cams.go2rtc.webrtcAnswer.mockRejectedValueOnce(new Go2rtcHttpError(500, "POST", "/api/webrtc", "codecs not matched"));
    expect((await webrtc(root.token, cam)).status).toBe(503);
    cams.go2rtc.webrtcAnswer.mockRejectedValueOnce(new Error(`dial ${SECRET_URL}`));
    expect((await webrtc(root.token, cam)).status).toBe(503);

    expect(lines).toContain(`cameras: webrtc signalling for ${cam} failed (go2rtc HTTP 500: codecs not matched)`);
    expect(lines).toContain(`cameras: webrtc signalling for ${cam} failed (Error)`);
    expect(lines.join("\n")).not.toContain("hunter2");
  });

  it("proxies the SDP answer for the live stream only when authorised", async () => {
    const { ann, cam } = await start();
    expect((await webrtc(ann.token, cam)).status).toBe(404);
    expect(cams.go2rtc.webrtcAnswer).not.toHaveBeenCalled();

    await h.grant(ann.id, cam);
    const res = await webrtc(ann.token, cam, "v=0\r\nmy-offer\r\n");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/sdp");
    expect(await res.text()).toBe("v=0\r\nanswer\r\n");
    expect(cams.go2rtc.webrtcAnswer).toHaveBeenCalledWith(LIVE(cam), "v=0\r\nmy-offer\r\n");
  });

  it("rejects an empty offer", async () => {
    const { root, cam } = await start();
    expect((await webrtc(root.token, cam, "")).status).toBe(400);
    expect(cams.go2rtc.webrtcAnswer).not.toHaveBeenCalled();
  });
});

describe("MSE proxy", () => {
  it("authenticates upstream and pipes both directions", async () => {
    const { root, cam } = await start();
    const client = await liveMse(root.token, cam);

    expect(cams.go2rtc.mseUrl).toHaveBeenCalledWith(LIVE(cam));
    expect(client.binary[0]).toEqual(Buffer.from([1, 2, 3]));
    client.ws.send(JSON.stringify({ type: "mse", value: "avc1" }));
    await vi.waitFor(() => expect(client.messages).toEqual([`echo:{"type":"mse","value":"avc1"}`]));
    expect(upstream.received).toEqual([`{"type":"mse","value":"avc1"}`]);
  });

  it("closes the upstream when the client leaves, and the client when the upstream ends", async () => {
    const { root, cam } = await start();
    const a = await liveMse(root.token, cam);
    a.ws.close();
    await vi.waitFor(() => expect(upstream.closed).toHaveLength(1));

    const b = await liveMse(root.token, cam);
    upstream.sockets[1]!.close();
    await b.closed();
  });

  it("caps the client's message size", async () => {
    const { root, cam } = await start();
    const client = await liveMse(root.token, cam);
    client.ws.send("x".repeat(1024 * 1024));
    expect((await client.closed()).code).toBe(1009);
  });

  it("closes with a coded reason, without details, when the camera is unavailable", async () => {
    const { root, cam } = await start();
    cams.streams.ensure.mockRejectedValueOnce(new CameraUnavailableError(`cannot use ${SECRET_URL}`));
    const client = mse(cam);
    await client.auth(root.token);
    const closed = await client.closed();
    expect(closed.code).toBe(4503);
    expect(closed.reason).not.toContain("rtsp://");
  });
});

describe("revocation", () => {
  async function watching() {
    const ctx = await start();
    await h.grant(ctx.ann.id, ctx.cam);
    expect((await webrtc(ctx.ann.token, ctx.cam)).status).toBe(200);
    const client = await liveMse(ctx.ann.token, ctx.cam);
    return { ...ctx, client };
  }

  /** Waits (real time) until go2rtc was restarted and the camera's WebRTC media is gone; returns how long it took. */
  async function mediaCut(cam: string, since: number): Promise<number> {
    await vi.waitFor(() => expect(cams.restartGo2rtc).toHaveBeenCalled(), { timeout: 5000, interval: 10 });
    const elapsed = performance.now() - since;
    await vi.waitFor(() => expect(cams.consumers(LIVE(cam))).not.toContain("webrtc"));
    return elapsed;
  }

  const settle = (ms = 100) => new Promise((r) => setTimeout(r, ms));

  it("restarts go2rtc (cutting WebRTC) and closes the MSE socket within 1 s of a grant being revoked", async () => {
    const { root, cam, client } = await watching();
    expect(cams.consumers(LIVE(cam))).toEqual(["webrtc", "mse/fmp4"]);
    const t0 = performance.now();
    await h.ok(root.token, SET_DEVICE_GRANTS, { d: cam, u: [] });

    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
    expect((await client.closed()).code).toBe(4404);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect((await webrtc(root.token, cam)).status).toBe(200); // other viewers simply re-signal
  });

  it("does not restart when nothing but our own MSE proxy and frame grabs consume the camera", async () => {
    const { root, ann, cam } = await start();
    await h.grant(ann.id, cam);
    expect((await thumbnail(ann.token, cam)).status).toBe(200);
    const client = await liveMse(ann.token, cam);
    cams.addConsumer(SUB(cam), "keyframe");
    await h.ok(root.token, SET_DEVICE_GRANTS, { d: cam, u: [] });
    expect((await client.closed()).code).toBe(4404);
    await settle();
    expect(cams.restartGo2rtc).not.toHaveBeenCalled();
  });

  it("does not restart when no one is watching", async () => {
    const { root, ann, cam } = await start();
    await h.grant(ann.id, cam);
    expect((await thumbnail(ann.token, cam)).status).toBe(200);
    await h.ok(root.token, SET_DEVICE_GRANTS, { d: cam, u: [] });
    await h.ok(ann.token, `mutation { logout }`);
    await settle();
    expect(cams.restartGo2rtc).not.toHaveBeenCalled();
  });

  it("coalesces events arriving together into one restart", async () => {
    const { root, ann, cam } = await watching();
    await Promise.all([
      h.ok(root.token, SET_DEVICE_GRANTS, { d: cam, u: [] }),
      h.ok(ann.token, `mutation { logout }`),
      h.ok(root.token, `mutation($id: ID!) { updateUser(id: $id, pin: "9753") { id } }`, { id: ann.id }),
    ]);
    await settle(RESTART_WINDOW_MS + 300); // past the window, where a deferred re-check would run
    expect(cams.restartGo2rtc).toHaveBeenCalledTimes(1);
  });

  it("cuts on any grant change, closing only the sockets of viewers who lost access", async () => {
    const { root, ann, cam, client } = await watching();
    const other = await h.user("Bob");
    const t0 = performance.now();
    await h.ok(root.token, SET_DEVICE_GRANTS, { d: cam, u: [ann.id, other.id] });
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
    await settle(50);
    expect(client.close).toBeUndefined();
  });

  it("cuts a viewer whose session is logged out", async () => {
    const { ann, cam, client } = await watching();
    const t0 = performance.now();
    await h.ok(ann.token, `mutation { logout }`);
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
    expect((await client.closed()).code).toBe(4401);
  });

  it("cuts a viewer whose PIN changes (sessions revoked)", async () => {
    const { root, ann, cam, client } = await watching();
    const t0 = performance.now();
    await h.ok(root.token, `mutation($id: ID!) { updateUser(id: $id, pin: "9753") { id } }`, { id: ann.id });
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
    expect((await client.closed()).code).toBe(4401);
  });

  it("cuts a deleted user's viewers", async () => {
    const { root, ann, cam, client } = await watching();
    const t0 = performance.now();
    await h.ok(root.token, `mutation($id: ID!) { deleteUser(id: $id) }`, { id: ann.id });
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
    expect((await client.closed()).code).toBe(4401);
  });

  it("cuts a viewer whose session expires, as soon as a session watch sees it", async () => {
    const { cam } = await start({ sessionCheckMs: 50 });
    const sam = await h.user("Sam", "USER", { shared: true });
    await h.grant(sam.id, cam);
    expect((await webrtc(sam.token, cam)).status).toBe(200);
    const client = await liveMse(sam.token, cam);
    const t0 = performance.now();
    h.advance(SHARED_IDLE_MS + 1);
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
    expect((await client.closed()).code).toBe(4401);
  });

  it("releases a removed camera, cuts its media and closes its viewers, without registering it again", async () => {
    const { root, cam, client } = await watching();
    cams.streams.ensure.mockClear();
    const t0 = performance.now();
    await h.ok(root.token, `mutation($id: ID!) { removeDevice(id: $id) }`, { id: cam });
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
    expect(cams.streams.release).toHaveBeenCalledWith(cam);
    expect((await client.closed()).code).toBe(4404);
    await settle(50);
    expect(cams.streams.ensure).not.toHaveBeenCalled();
  });

  it("still cuts a WebRTC viewer that last signalled more than 60 s ago", async () => {
    const { root, ann, cam } = await start();
    await h.grant(ann.id, cam);
    expect((await webrtc(ann.token, cam)).status).toBe(200);
    h.advance(61_000);
    const t0 = performance.now();
    await h.ok(root.token, SET_DEVICE_GRANTS, { d: cam, u: [] });
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
  });

  it("cuts on a grant revoke even when the viewer is no longer tracked (10 min without signalling)", async () => {
    const { root, ann, cam } = await start();
    await h.grant(ann.id, cam);
    expect((await webrtc(ann.token, cam)).status).toBe(200);
    h.advance(10 * 60_000 + 1);
    const t0 = performance.now();
    await h.ok(root.token, SET_DEVICE_GRANTS, { d: cam, u: [] });
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
  });

  /** Stream names whose consumers were read (what a cut looked at). */
  const inspected = () => new Set(cams.go2rtc.streamInfo.mock.calls.map((c) => c[0]));

  it("does not cut anything when a session that never watched is logged out", async () => {
    const { root, ann, cam } = await start();
    await h.grant(ann.id, cam);
    expect((await webrtc(root.token, cam)).status).toBe(200); // someone else is watching
    expect((await thumbnail(ann.token, cam)).status).toBe(200); // a thumbnail is not video
    await h.ok(ann.token, `mutation { logout }`);
    await settle();
    expect(cams.go2rtc.streamInfo).not.toHaveBeenCalled();
    expect(cams.restartGo2rtc).not.toHaveBeenCalled();
  });

  it("cuts only the cameras the logged-out session watched", async () => {
    const { root, ann, cam: a } = await start();
    const b = await h.device({ brand: "SWANN", kind: "CAMERA", name: "Yard" });
    await h.grant(ann.id, a);
    expect((await webrtc(ann.token, a)).status).toBe(200);
    expect((await webrtc(root.token, b)).status).toBe(200);
    const t0 = performance.now();
    await h.ok(ann.token, `mutation { logout }`);
    expect(await mediaCut(a, t0)).toBeLessThan(1000);
    expect(inspected()).toEqual(new Set([LIVE(a), SUB(a)]));
  });

  it("does not restart when the logged-out session's camera has no consumers left", async () => {
    const { root, ann, cam: a } = await start();
    const b = await h.device({ brand: "SWANN", kind: "CAMERA", name: "Yard" });
    await h.grant(ann.id, a);
    expect((await webrtc(ann.token, a)).status).toBe(200);
    expect((await webrtc(root.token, b)).status).toBe(200);
    cams.clearConsumers(LIVE(a)); // Ann's browser already hung up
    await h.ok(ann.token, `mutation { logout }`);
    await vi.waitFor(() => expect(inspected()).toContain(LIVE(a)));
    await settle();
    expect(cams.restartGo2rtc).not.toHaveBeenCalled();
    expect(inspected()).not.toContain(LIVE(b));
  });

  it("cuts the cameras of all of a user's sessions when their sessions are revoked", async () => {
    const { root, ann, cam: a } = await start();
    const b = await h.device({ brand: "SWANN", kind: "CAMERA", name: "Yard" });
    const c = await h.device({ brand: "SWANN", kind: "CAMERA", name: "Gate" });
    await h.grant(ann.id, a, b);
    const tablet = await createSession(h.db, ann.id, false, new Date(h.time));
    expect((await webrtc(ann.token, a)).status).toBe(200);
    expect((await webrtc(tablet, b)).status).toBe(200);
    expect((await webrtc(root.token, c)).status).toBe(200);
    const t0 = performance.now();
    await h.ok(root.token, `mutation($id: ID!) { updateUser(id: $id, pin: "9753") { id } }`, { id: ann.id });
    expect(await mediaCut(a, t0)).toBeLessThan(1000);
    expect(inspected()).toEqual(new Set([LIVE(a), SUB(a), LIVE(b), SUB(b)]));
  });

  it("remembers a session's cameras beyond the 10-minute viewer tracking", async () => {
    const { ann, cam } = await start();
    await h.grant(ann.id, cam);
    expect((await webrtc(ann.token, cam)).status).toBe(200);
    h.advance(11 * 60_000);
    const t0 = performance.now();
    await h.ok(ann.token, `mutation { logout }`);
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
  });

  it("sweeps: an untracked session that simply expires has its cameras cut", async () => {
    const { cam } = await start({ viewerSweepMs: 100 });
    const sam = await h.user("Sam", "USER", { shared: true });
    await h.grant(sam.id, cam);
    expect((await webrtc(sam.token, cam)).status).toBe(200);
    h.advance(11 * 60_000); // past viewer tracking, and the shared session's expiry
    const t0 = performance.now();
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
  });

  it("cuts when an expired session is found by a request check", async () => {
    const { cam } = await start();
    const sam = await h.user("Sam", "USER", { shared: true });
    await h.grant(sam.id, cam);
    expect((await webrtc(sam.token, cam)).status).toBe(200);
    h.advance(SHARED_IDLE_MS + 1);
    const t0 = performance.now();
    expect((await thumbnail(sam.token, cam)).status).toBe(401);
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
  });

  it("does not cut for a bogus token", async () => {
    const { cam, root } = await start();
    expect((await webrtc(root.token, cam)).status).toBe(200);
    expect((await thumbnail("bogus", cam)).status).toBe(401);
    await settle(50);
    expect(cams.restartGo2rtc).not.toHaveBeenCalled();
  });

  it("sweeps: a WebRTC viewer whose session simply expires is cut within one sweep", async () => {
    const { cam } = await start({ viewerSweepMs: 100 });
    const sam = await h.user("Sam", "USER", { shared: true });
    await h.grant(sam.id, cam);
    expect((await webrtc(sam.token, cam)).status).toBe(200);
    h.advance(SHARED_IDLE_MS + 1);
    const t0 = performance.now();
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
  });

  it("sweeps: a viewer whose access went without an event is closed and its media cut", async () => {
    const { ann, cam } = await start({ viewerSweepMs: 100 });
    await h.grant(ann.id, cam);
    expect((await webrtc(ann.token, cam)).status).toBe(200);
    const client = await liveMse(ann.token, cam);
    await h.db.deviceGrant.deleteMany({ where: { userId: ann.id } }); // no grantsChanged
    const t0 = performance.now();
    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
    expect((await client.closed()).code).toBe(4404);
  });

  it("on a stream source switch, closes MSE viewers to reconnect, drops the cached frame, releases and restarts for WebRTC", async () => {
    const { root, cam, client } = await watching();
    expect((await thumbnail(root.token, cam)).status).toBe(200);
    cams.go2rtc.frameJpeg.mockClear();
    const t0 = performance.now();

    h.cameraEvents.emit("sourceChanged", cam);

    expect(await mediaCut(cam, t0)).toBeLessThan(1000);
    expect(cams.streams.release).toHaveBeenCalledWith(cam);
    expect((await client.closed()).code).toBe(1012);
    expect((await thumbnail(root.token, cam)).status).toBe(200);
    expect(cams.go2rtc.frameJpeg).toHaveBeenCalledTimes(1);
  });

  it("on a stream source switch, releases the old streams before closing MSE viewers (no reconnect onto the old registration)", async () => {
    const { cam, client } = await watching();
    let released = false;
    cams.streams.release.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 150));
      released = true;
    });
    let releasedAtClose: boolean | undefined;
    client.ws.on("close", () => (releasedAtClose = released));

    h.cameraEvents.emit("sourceChanged", cam);

    expect((await client.closed()).code).toBe(1012);
    expect(releasedAtClose).toBe(true);
  });

  it("restarts when go2rtc cannot say who is consuming, and survives a failing restart", async () => {
    const { root, cam, client } = await watching();
    cams.go2rtc.streamInfo.mockRejectedValue(new Error("go2rtc GET /api/streams: ECONNRESET"));
    cams.restartGo2rtc.mockImplementationOnce(() => {
      throw new Error("kill failed");
    });
    await h.ok(root.token, SET_DEVICE_GRANTS, { d: cam, u: [] });
    expect((await client.closed()).code).toBe(4404);
    await vi.waitFor(() => expect(cams.restartGo2rtc).toHaveBeenCalledTimes(1));
  });
});

describe("routing and leaks", () => {
  const dist = mkdtempSync(join(tmpdir(), "home-web-cam-"));
  writeFileSync(join(dist, "index.html"), "<html>Home</html>");
  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  it("never answers /api/cameras/* with the SPA's index.html", async () => {
    const { cam } = await start({ webDist: dist });
    for (const path of [`/${cam}/thumbnail.jpg`, `/${cam}/unknown`, ``, `/x`]) {
      const res = await fetch(`${base()}${path}`);
      expect([path, (await res.text()).includes("<html>Home</html>")]).toEqual([path, false]);
    }
    expect(await (await fetch(`http://127.0.0.1:${h.server.port}/admin`)).text()).toBe("<html>Home</html>");
  });

  it("never puts a source URL in a response, even when every dependency fails with one", async () => {
    const { root, cam } = await start();
    cams.streams.ensure.mockRejectedValue(new Error(`registry exploded at ${SECRET_URL}`));
    cams.go2rtc.webrtcAnswer.mockRejectedValue(new Error(`webrtc exploded at ${SECRET_URL}`));
    for (const res of [await thumbnail(root.token, cam), await webrtc(root.token, cam)]) {
      expect(res.status).toBe(503);
      const body = await res.text();
      expect(body).not.toContain("rtsp://");
      expect(body).not.toContain("cam-");
      expect([...res.headers.values()].join(" ")).not.toContain("rtsp://");
    }
    cams.streams.ensure.mockResolvedValue({ live: LIVE(cam), thumb: SUB(cam) });
    const ok = await webrtc(root.token, cam);
    expect(await ok.text()).not.toContain("rtsp://");
  });

  it("answers 503 CLOUD_STREAM_UNAVAILABLE (code only) when the Tuya cloud gives no stream", async () => {
    const { root, cam } = await start();
    cams.streams.ensure.mockRejectedValue(new TuyaCloudStreamUnavailableError({ cause: new Error(`refused ${SECRET_URL}`) }));
    for (const res of [await thumbnail(root.token, cam), await webrtc(root.token, cam)]) {
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ code: "CLOUD_STREAM_UNAVAILABLE" });
    }
    cams.streams.ensure.mockRejectedValue(new CameraUnavailableError("go2rtc down"));
    expect(await (await thumbnail(root.token, cam)).json()).toEqual({ code: "CAMERA_UNAVAILABLE" });
  });

  it("answers malformed upgrade targets with 400 and stays up", async () => {
    const { root, cam } = await start();
    for (const target of ["//%zz", "http://[", "/api/cameras/%zz/mse", "*", "x".repeat(4000)]) {
      expect([target.slice(0, 20), await rawUpgrade(target)]).toEqual([target.slice(0, 20), "HTTP/1.1 400"]);
    }
    expect(await rawUpgrade("/nowhere")).toBe("HTTP/1.1 404");
    expect((await thumbnail(root.token, cam)).status).toBe(200);
  });

  it("still serves GraphQL subscriptions next to the camera WebSocket", async () => {
    const { root } = await start();
    const ws = h.wsClient(root.token);
    const sub = await h.subscribe(ws, `subscription { devicesChanged }`);
    expect(sub.error).toBeUndefined();
    sub.close();
  });
});

/** Sends a raw WebSocket upgrade request with the given target; resolves with the status line's first 12 chars. */
function rawUpgrade(target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(h.server.port, "127.0.0.1", () => {
      socket.write(
        `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    let data = "";
    socket.on("data", (chunk) => (data += chunk.toString()));
    socket.on("close", () => resolve(data.slice(0, 12)));
    socket.on("error", reject);
  });
}

describe("stream quality", () => {
  it("parses only quality=sub as the light stream", () => {
    expect(qualityOf("/api/cameras/x/mse?quality=sub")).toBe("sub");
    expect(qualityOf("/api/cameras/x/mse?quality=SUB")).toBe("main");
    expect(qualityOf("/api/cameras/x/mse")).toBe("main");
    expect(qualityOf(undefined)).toBe("main");
    expect(qualityOf("%%%")).toBe("main");
  });

  const OFFER = "v=0\r\noffer\r\n";

  it("webrtc with quality=sub answers from the light stream", async () => {
    const { root, cam } = await start();
    const res = await fetch(`${base()}/${cam}/webrtc?quality=sub`, {
      method: "POST",
      headers: { "content-type": "application/sdp", authorization: `Bearer ${root.token}` },
      body: OFFER,
    });
    expect(res.status).toBe(200);
    expect(cams.go2rtc.webrtcAnswer).toHaveBeenCalledWith(SUB(cam), expect.any(String));
  });

  it("mse with quality=sub pipes the light stream", async () => {
    const { root, cam } = await start();
    const ws = new WebSocket(`ws://127.0.0.1:${h.server.port}/api/cameras/${cam}/mse?quality=sub`);
    sockets.push(ws);
    ws.on("error", () => {});
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));
    ws.send(JSON.stringify({ authToken: root.token }));
    await vi.waitFor(() => expect(cams.go2rtc.mseUrl).toHaveBeenCalledWith(SUB(cam)));
  });

  it("quality=sub on a camera without a sub-stream uses the main stream", async () => {
    const { root, cam } = await start();
    cams.streams.ensure.mockImplementation(async (device: { id: string }) => ({ live: LIVE(device.id), thumb: LIVE(device.id) }));
    const res = await fetch(`${base()}/${cam}/webrtc?quality=sub`, {
      method: "POST",
      headers: { "content-type": "application/sdp", authorization: `Bearer ${root.token}` },
      body: OFFER,
    });
    expect(res.status).toBe(200);
    expect(cams.go2rtc.webrtcAnswer).toHaveBeenCalledWith(LIVE(cam), expect.any(String));
  });

  it("checks access the same way for quality=sub", async () => {
    const { ann, cam } = await start();
    const res = await fetch(`${base()}/${cam}/webrtc?quality=sub`, {
      method: "POST",
      headers: { "content-type": "application/sdp", authorization: `Bearer ${ann.token}` },
      body: OFFER,
    });
    expect(res.status).toBe(404);
    expect(cams.go2rtc.webrtcAnswer).not.toHaveBeenCalled();
  });
});


import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Go2rtcApi } from "../src/cameras/go2rtc/api.js";
import { basicAuthHeader, generateCredentials } from "../src/cameras/go2rtc/credentials.js";
import { Go2rtcSupervisor } from "../src/cameras/go2rtc/supervisor.js";
import { fakeGo2rtc, getJson, send, testLog, type FakeGo2rtc } from "./go2rtc-helpers.js";

interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  contentType?: string;
}

describe("Go2rtcApi", () => {
  const credentials = generateCredentials();
  let fake: FakeGo2rtc;
  let supervisor: Go2rtcSupervisor;
  let api: Go2rtcApi;
  let tmp: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "go2rtc-api-test-"));
    fake = await fakeGo2rtc();
    api = new Go2rtcApi(credentials, fake.baseUrl);
    supervisor = new Go2rtcSupervisor({
      command: fake.command,
      args: fake.args,
      ffmpegPath: "ffmpeg.exe",
      credentials,
      api,
      log: testLog(),
      pollMs: 20,
      pidFile: join(tmp, "go2rtc.pid"),
      tempDir: tmp,
    });
    const ready = once(supervisor, "ready");
    await supervisor.start();
    await ready;
  });
  afterEach(async () => {
    await supervisor.stop();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("registers streams in memory only (PATCH, which go2rtc does not write to its config), uses and deletes them", async () => {
    await api.putStream("cam 1", "rtsp://u:p@10.0.0.5:554/ch1?subtype=0");
    await expect(api.frameJpeg("cam 1")).resolves.toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]));
    await expect(api.webrtcAnswer("cam 1", "v=0 offer")).resolves.toBe("answer-for:v=0 offer");
    await api.deleteStream("cam 1");

    const { calls } = await getJson<{ calls: Call[] }>(`${fake.baseUrl}/__calls`);
    const relevant = calls.filter((c) => c.path !== "/api");
    expect(relevant.map((c) => [c.method, c.path, c.query])).toEqual([
      ["PATCH", "/api/streams", { name: "cam 1", src: "rtsp://u:p@10.0.0.5:554/ch1?subtype=0" }],
      ["GET", "/api/frame.jpeg", { src: "cam 1" }],
      ["POST", "/api/webrtc", { src: "cam 1" }],
      ["DELETE", "/api/streams", { src: "cam 1" }],
    ]);
    expect(relevant[2]!.contentType).toBe("application/sdp");
  });

  it("reports a stream's consumers by format only (never its producers or source), and null for no stream", async () => {
    await api.putStream("cam 1", "rtsp://u:secret@10.0.0.5:554/ch1");
    await send("POST", `${fake.baseUrl}/__consumers?src=cam%201&formats=webrtc,mse/fmp4`);
    const info = await api.streamInfo("cam 1");
    expect(info).toEqual({ producers: [{ active: false }], consumers: [{ formatName: "webrtc" }, { formatName: "mse/fmp4" }] });
    expect(JSON.stringify(info)).not.toContain("secret");
    await expect(api.streamInfo("nope")).resolves.toBeNull();
  });

  it("is refused without the per-run credentials", async () => {
    expect((await send("GET", `${fake.baseUrl}/api`)).status).toBe(401);
    const wrong = new Go2rtcApi(generateCredentials(), fake.baseUrl);
    await expect(wrong.info()).rejects.toMatchObject({ status: 401 });
    await expect(api.info()).resolves.toMatchObject({ version: "fake" });
  });

  it("fails without echoing the stream source", async () => {
    const err = await api.frameJpeg("nope").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toContain("404");
  });

  it("builds the MSE WebSocket URL and the auth header needed to open it", () => {
    const local = new Go2rtcApi(credentials);
    expect(local.mseUrl("cam 1")).toBe("ws://127.0.0.1:1984/api/ws?src=cam%201");
    expect(local.authHeaders()).toEqual({ authorization: basicAuthHeader(credentials) });
  });
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeGo2rtcConfig } from "../src/cameras/go2rtc/config.js";
import { basicAuthHeader, generateCredentials } from "../src/cameras/go2rtc/credentials.js";

describe("writeGo2rtcConfig", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "go2rtc-config-test-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes a localhost-only, authenticated API, a localhost-only RTSP server, no SRTP, and no streams", () => {
    const ffmpeg = "C:\\tools\\ffmpeg\\ffmpeg.exe";
    const path = writeGo2rtcConfig(dir, ffmpeg, { username: "home-u", password: "p@ss\"word" }, { username: "rtsp-u", password: "rtsp-p" });
    expect(path.startsWith(dir)).toBe(true);
    const yaml = readFileSync(path, "utf8");
    expect(yaml).not.toMatch(/streams:/);
    expect(yaml).toBe(
      [
        "api:",
        '  listen: "127.0.0.1:1984"',
        '  username: "home-u"',
        '  password: "p@ss\\"word"',
        "  local_auth: true",
        '  origin: ""',
        "rtsp:",
        '  listen: "127.0.0.1:8554"',
        '  username: "rtsp-u"',
        '  password: "rtsp-p"',
        "srtp:",
        '  listen: ""',
        "webrtc:",
        '  listen: ":8555"',
        "ffmpeg:",
        '  bin: "C:\\\\tools\\\\ffmpeg\\\\ffmpeg.exe"',
        "",
      ].join("\n"),
    );
  });

  it("gets fresh, long random API credentials every run", () => {
    const a = generateCredentials();
    const b = generateCredentials();
    expect(a.username).not.toBe(b.username);
    expect(a.password).not.toBe(b.password);
    expect(a.username.length).toBeGreaterThanOrEqual(24);
    expect(a.password.length).toBeGreaterThanOrEqual(24);

    const yamlA = readFileSync(writeGo2rtcConfig(dir, "ffmpeg.exe", a), "utf8");
    expect(yamlA).toContain(`username: "${a.username}"`);
    expect(yamlA).toContain(`password: "${a.password}"`);
    const yamlB = readFileSync(writeGo2rtcConfig(dir, "ffmpeg.exe", b), "utf8");
    expect(yamlB).not.toContain(a.password);
  });

  it("binds RTSP (needed by ffmpeg sources to publish back) to loopback only, with its own fresh random login", () => {
    const api = generateCredentials();
    const yaml = readFileSync(writeGo2rtcConfig(dir, "ffmpeg.exe", api), "utf8");
    const rtsp = /rtsp:\n {2}listen: "([^"]*)"\n {2}username: "([^"]+)"\n {2}password: "([^"]+)"\n/.exec(yaml);
    expect(rtsp).not.toBeNull();
    const [, listen, username, password] = rtsp!;
    expect(listen).toBe("127.0.0.1:8554");
    expect(listen).not.toMatch(/^(:|0\.0\.0\.0|\[::\])/);
    expect(username!.length).toBeGreaterThanOrEqual(24);
    expect(password!.length).toBeGreaterThanOrEqual(24);
    expect([username, password]).not.toContain(api.username);
    expect([username, password]).not.toContain(api.password);
    const again = readFileSync(writeGo2rtcConfig(dir, "ffmpeg.exe", api), "utf8");
    expect(again).not.toContain(password!);
    // Only WebRTC listens beyond loopback.
    const listens = [...yaml.matchAll(/listen: "([^"]*)"/g)].map((m) => m[1]);
    expect(listens.filter((l) => l && !l.startsWith("127.0.0.1:"))).toEqual([":8555"]);
  });

  it("builds a Basic auth header", () => {
    expect(basicAuthHeader({ username: "u", password: "p" })).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
  });
});

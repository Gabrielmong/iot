import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Go2rtcApi } from "../src/cameras/go2rtc/api.js";
import { generateCredentials } from "../src/cameras/go2rtc/credentials.js";
import { reregisterOnReady } from "../src/cameras/go2rtc/reregister.js";
import { Go2rtcSupervisor } from "../src/cameras/go2rtc/supervisor.js";
import { crashFake, fakeGo2rtc, getJson, isAlive, isListening, testLog, type FakeGo2rtc } from "./go2rtc-helpers.js";

interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
}

describe("Go2rtcSupervisor", () => {
  let fake: FakeGo2rtc;
  let tmp: string;
  let supervisor: Go2rtcSupervisor | undefined;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "go2rtc-sup-test-"));
    fake = await fakeGo2rtc();
  });

  afterEach(async () => {
    await supervisor?.stop();
    supervisor = undefined;
    vi.useRealTimers();
    rmSync(tmp, { recursive: true, force: true });
  });

  const create = (l = testLog(), f = fake) => {
    const credentials = generateCredentials();
    const api = new Go2rtcApi(credentials, f.baseUrl);
    supervisor = new Go2rtcSupervisor({
      command: f.command,
      args: f.args,
      ffmpegPath: "ffmpeg.exe",
      credentials,
      api,
      log: l,
      pollMs: 20,
      pidFile: join(tmp, "go2rtc.pid"),
      tempDir: tmp,
    });
    return { sup: supervisor, api };
  };

  it("spawns the binary with -config pointing at a temp config without streams, and records its pid", async () => {
    const { sup } = create();
    const ready = once(sup, "ready");
    await sup.start();
    await ready;
    const { config } = await getJson<{ config: string }>(`${fake.baseUrl}/__calls`);
    expect(config).toContain('listen: "127.0.0.1:1984"');
    expect(config).not.toMatch(/streams:/);
    expect(readFileSync(join(tmp, "go2rtc.pid"), "utf8").trim()).toBe(String(sup.pid));
  });

  it("restarts 1 s after the process exits, and streams are re-registered on every ready", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const l = testLog();
    const { sup, api } = create(l);
    reregisterOnReady(sup, api, { streams: () => [{ name: "cam-1", src: "rtsp://user:secret@10.0.0.5/ch1" }] }, l);

    const firstReady = once(sup, "ready");
    await sup.start();
    await firstReady;
    await vi.waitFor(async () => {
      const { calls } = await getJson<{ calls: Call[] }>(`${fake.baseUrl}/__calls`);
      expect(calls).toContainEqual(
        expect.objectContaining({ path: "/api/streams", query: { name: "cam-1", src: "rtsp://user:secret@10.0.0.5/ch1" } }),
      );
    });

    const down = once(sup, "down");
    await crashFake(fake.baseUrl);
    await down;
    expect(await isListening(fake.port)).toBe(false);

    await vi.advanceTimersByTimeAsync(999);
    expect(await isListening(fake.port)).toBe(false);

    const secondReady = once(sup, "ready");
    await vi.advanceTimersByTimeAsync(1);
    await secondReady;
    await vi.waitFor(async () => {
      const { calls } = await getJson<{ calls: Call[] }>(`${fake.baseUrl}/__calls`);
      expect(calls.filter((c) => c.path === "/api/streams" && c.query.name === "cam-1")).toHaveLength(1);
    });

    // The stream source carries credentials: only the name may be logged.
    const logged = JSON.stringify([l.info.mock.calls, l.warn.mock.calls, l.error.mock.calls]);
    expect(logged).not.toContain("secret");
  });

  it("restart() kills go2rtc and starts it again at once (no backoff), re-registering streams on ready", async () => {
    const l = testLog();
    const { sup, api } = create(l);
    reregisterOnReady(sup, api, { streams: () => [{ name: "cam-1", src: "rtsp://user:secret@10.0.0.5/ch1" }] }, l);
    const firstReady = once(sup, "ready");
    await sup.start();
    await firstReady;
    await vi.waitFor(async () => {
      const { calls } = await getJson<{ calls: Call[] }>(`${fake.baseUrl}/__calls`);
      expect(calls.filter((c) => c.path === "/api/streams" && c.query.name === "cam-1")).toHaveLength(1);
    });
    const firstPid = sup.pid!;

    const down = once(sup, "down");
    const secondReady = once(sup, "ready");
    const t0 = performance.now();
    sup.restart();
    await down;
    await secondReady;
    expect(performance.now() - t0).toBeLessThan(1000); // the crash path would wait 1 s first
    expect(sup.pid).not.toBe(firstPid);
    expect(isAlive(firstPid)).toBe(false);
    await vi.waitFor(async () => {
      const { calls } = await getJson<{ calls: Call[] }>(`${fake.baseUrl}/__calls`);
      expect(calls.filter((c) => c.path === "/api/streams" && c.query.name === "cam-1")).toHaveLength(1);
    });
    expect(l.warn).not.toHaveBeenCalled();
  });

  it("restart() does nothing when go2rtc is not running, or not ready yet (no restart loops while it starts)", async () => {
    const l = testLog();
    const { sup } = create(l);
    expect(() => sup.restart()).not.toThrow();
    expect(sup.pid).toBeUndefined();

    const ready = once(sup, "ready");
    await sup.start();
    const startingPid = sup.pid;
    sup.restart();
    await ready;
    expect(sup.pid).toBe(startingPid);
    expect(l.info).not.toHaveBeenCalledWith("go2rtc restarted to end media sessions");
  });

  it("never treats another go2rtc instance as its own: no ready, the child is killed and restarted", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const l = testLog();
    const { sup } = create(l, await fakeGo2rtc(["--foreign"]));
    const ready = vi.fn();
    sup.on("ready", ready);
    const down = once(sup, "down");
    await sup.start();
    await down;
    expect(ready).not.toHaveBeenCalled();
    expect(l.warn).toHaveBeenCalledWith(expect.stringContaining("not this server's go2rtc"));
  });

  it("disables cameras with one log line when the binary is missing, and start still resolves", async () => {
    const l = testLog();
    const missing = join(tmpdir(), "definitely-missing", "go2rtc.exe");
    const credentials = generateCredentials();
    supervisor = new Go2rtcSupervisor({
      command: missing,
      ffmpegPath: "ffmpeg.exe",
      credentials,
      api: new Go2rtcApi(credentials, fake.baseUrl),
      log: l,
      pidFile: join(tmp, "go2rtc.pid"),
      tempDir: tmp,
    });
    const ready = vi.fn();
    supervisor.on("ready", ready);
    await expect(supervisor.start()).resolves.toBeUndefined();
    expect(supervisor.enabled).toBe(false);
    expect(l.warn).toHaveBeenCalledExactlyOnceWith(`cameras disabled: go2rtc not found at ${missing}`);
    expect(l.error).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
  });

  it("stop() kills the child, removes the config and pid file, and leaves no restart", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { sup } = create();
    const ready = once(sup, "ready");
    await sup.start();
    await ready;
    const pid = sup.pid!;
    const configPath = sup.configPath!;
    expect(existsSync(configPath)).toBe(true);

    const down = vi.fn();
    sup.on("down", down);
    await sup.stop();

    expect(isAlive(pid)).toBe(false);
    expect(existsSync(configPath)).toBe(false);
    expect(existsSync(join(tmp, "go2rtc.pid"))).toBe(false);
    expect(sup.pid).toBeUndefined();

    await vi.advanceTimersByTimeAsync(120_000);
    expect(await isListening(fake.port)).toBe(false);
    expect(down).not.toHaveBeenCalled();
  });

  it("prepareStop() suppresses restarts while the rest of shutdown runs", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const l = testLog();
    const { sup } = create(l);
    const ready = once(sup, "ready");
    await sup.start();
    await ready;
    const down = vi.fn();
    sup.on("down", down);

    sup.prepareStop();
    await crashFake(fake.baseUrl);
    await vi.waitFor(async () => expect(await isListening(fake.port)).toBe(false));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await isListening(fake.port)).toBe(false);
    expect(down).not.toHaveBeenCalled();
    expect(l.warn).not.toHaveBeenCalledWith(expect.stringContaining("restarting"));
  });

  it("a throwing ready listener is logged, not an unhandled rejection", async () => {
    const l = testLog();
    const { sup } = create(l);
    sup.on("ready", () => {
      throw new Error("listener broke");
    });
    await sup.start();
    await vi.waitFor(() => expect(l.error).toHaveBeenCalledWith(expect.stringContaining("ready listener failed")));
    // Only the error's class: a listener's message could carry a stream source.
    expect(l.error).toHaveBeenCalledWith("go2rtc: a ready listener failed (Error)");
    expect(l.error.mock.calls.flat().join(" ")).not.toContain("listener broke");
  });

  it("removes credential folders left by earlier runs, but not its own", async () => {
    const stale = join(tmp, "home-go2rtc-old");
    mkdirSync(stale);
    writeFileSync(join(stale, "go2rtc.yaml"), 'password: "old"');
    const unrelated = join(tmp, "something-else");
    mkdirSync(unrelated);

    const { sup } = create();
    const ready = once(sup, "ready");
    await sup.start();
    await ready;
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(unrelated)).toBe(true);
    expect(dirname(sup.configPath!)).toMatch(/home-go2rtc-/);
    expect(existsSync(sup.configPath!)).toBe(true);
  });
});

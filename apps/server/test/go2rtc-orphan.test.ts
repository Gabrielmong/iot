import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Go2rtcApi } from "../src/cameras/go2rtc/api.js";
import { writeGo2rtcConfig } from "../src/cameras/go2rtc/config.js";
import { generateCredentials } from "../src/cameras/go2rtc/credentials.js";
import { killOrphan } from "../src/cameras/go2rtc/orphan.js";
import { Go2rtcSupervisor } from "../src/cameras/go2rtc/supervisor.js";
import { fakeGo2rtc, isAlive, isListening, spawnFakeDirectly, testLog } from "./go2rtc-helpers.js";

describe("orphaned go2rtc from a previous run", () => {
  let tmp: string;
  let supervisor: Go2rtcSupervisor | undefined;
  const orphans: number[] = [];

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "go2rtc-orphan-test-"));
  });
  afterEach(async () => {
    await supervisor?.stop();
    supervisor = undefined;
    for (const pid of orphans.splice(0)) if (isAlive(pid)) process.kill(pid);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("is killed (by its pid file) before the new go2rtc spawns, which then becomes ready", async () => {
    const fake = await fakeGo2rtc();
    // The orphan holds the port with the previous run's credentials.
    const orphan = spawnFakeDirectly(fake, writeGo2rtcConfig(tmp, "ffmpeg.exe", generateCredentials()));
    orphans.push(orphan.pid!);
    const pidFile = join(tmp, "go2rtc.pid");
    writeFileSync(pidFile, String(orphan.pid));

    const l = testLog();
    const credentials = generateCredentials();
    supervisor = new Go2rtcSupervisor({
      command: fake.command,
      args: fake.args,
      ffmpegPath: "ffmpeg.exe",
      credentials,
      api: new Go2rtcApi(credentials, fake.baseUrl),
      log: l,
      pollMs: 20,
      pidFile,
      tempDir: tmp,
    });
    const ready = once(supervisor, "ready");
    await supervisor.start();
    expect(isAlive(orphan.pid!)).toBe(false);
    expect(l.info).toHaveBeenCalledWith(`killed orphaned go2rtc (pid ${orphan.pid})`);
    await ready;
    expect(supervisor.pid).not.toBe(orphan.pid);
  });

  it("leaves a live process alone when it is not the configured binary (reused pid), and ignores a dead pid", async () => {
    const pidFile = join(tmp, "go2rtc.pid");
    const l = testLog();
    const fake = await fakeGo2rtc();
    const other = spawnFakeDirectly(fake, writeGo2rtcConfig(tmp, "ffmpeg.exe", generateCredentials()));
    orphans.push(other.pid!);
    await vi.waitFor(async () => expect(await isListening(fake.port)).toBe(true));

    // A node process, while the configured binary is go2rtc.exe.
    writeFileSync(pidFile, String(other.pid));
    await killOrphan(pidFile, join(tmp, "go2rtc.exe"), l);
    expect(isAlive(other.pid!)).toBe(true);

    writeFileSync(pidFile, "999999");
    await killOrphan(pidFile, join(tmp, "go2rtc.exe"), l);
    expect(l.info).not.toHaveBeenCalled();
  });

  it("does not claim a kill when the orphan survives it", { timeout: 15_000 }, async () => {
    const pidFile = join(tmp, "go2rtc.pid");
    const l = testLog();
    const fake = await fakeGo2rtc();
    const stubborn = spawnFakeDirectly(fake, writeGo2rtcConfig(tmp, "ffmpeg.exe", generateCredentials()));
    orphans.push(stubborn.pid!);
    writeFileSync(pidFile, String(stubborn.pid));
    const realKill = process.kill.bind(process);
    const kill = vi.spyOn(process, "kill").mockImplementation((pid, sig) => (sig === 0 ? realKill(pid, 0) : true));

    await killOrphan(pidFile, fake.command, l);
    kill.mockRestore();
    expect(isAlive(stubborn.pid!)).toBe(true);
    expect(l.info).not.toHaveBeenCalled();
    expect(l.warn).toHaveBeenCalledWith(`could not kill orphaned go2rtc (pid ${stubborn.pid})`);
  });

  it("never fails start(): a broken pid file only warns, and stop() still removes the config folder", async () => {
    const pidFile = join(tmp, "go2rtc.pid");
    mkdirSync(pidFile);
    writeFileSync(join(pidFile, "keep"), "x"); // a non-empty directory: removing the "pid file" throws
    const l = testLog();
    const fake = await fakeGo2rtc();
    const credentials = generateCredentials();
    supervisor = new Go2rtcSupervisor({
      command: fake.command,
      args: fake.args,
      ffmpegPath: "ffmpeg.exe",
      credentials,
      api: new Go2rtcApi(credentials, fake.baseUrl),
      log: l,
      pollMs: 20,
      pidFile,
      tempDir: tmp,
    });
    const ready = once(supervisor, "ready");
    await expect(supervisor.start()).resolves.toBeUndefined();
    await ready;
    expect(l.warn).toHaveBeenCalledWith(expect.stringContaining("orphan check failed"));

    const configPath = supervisor.configPath!;
    await supervisor.stop();
    expect(existsSync(configPath)).toBe(false);
    expect(l.warn).toHaveBeenCalledWith(expect.stringContaining("could not remove its pid file"));
  });
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PID_FILE, readPidFile, writePidFile } from "../src/cameras/go2rtc/pid-file.js";

describe("go2rtc pid file", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "go2rtc-pid-test-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("lives in the app's private logs/run folder, not the shared temp dir", () => {
    const repo = join(import.meta.dirname, "..", "..", "..");
    expect(DEFAULT_PID_FILE).toBe(join(repo, "logs", "run", "go2rtc.pid"));
  });

  it("writes (creating its folder) and reads back, replacing an old regular file", () => {
    const path = join(tmp, "run", "go2rtc.pid");
    expect(writePidFile(path, 1234)).toBe(true);
    expect(readPidFile(path)).toBe(1234);
    expect(writePidFile(path, 5678)).toBe(true);
    expect(readPidFile(path)).toBe(5678);
  });

  it("refuses a directory at the pid path", () => {
    const path = join(tmp, "go2rtc.pid");
    mkdirSync(path);
    expect(writePidFile(path, 1234)).toBe(false);
    expect(readPidFile(path)).toBeUndefined();
  });

  it("refuses a directory link (junction) at the pid path instead of following it", () => {
    const target = join(tmp, "elsewhere");
    mkdirSync(target);
    const path = join(tmp, "go2rtc.pid");
    symlinkSync(target, path, "junction");
    expect(writePidFile(path, 1234)).toBe(false);
    expect(readPidFile(path)).toBeUndefined();
  });

  it("refuses a file symlink at the pid path and never writes through it", (ctx) => {
    const target = join(tmp, "victim.txt");
    writeFileSync(target, "4321");
    const path = join(tmp, "go2rtc.pid");
    try {
      symlinkSync(target, path, "file");
    } catch (err) {
      // Windows without Developer Mode cannot create file symlinks; the junction case covers links there.
      if ((err as NodeJS.ErrnoException).code === "EPERM") return ctx.skip();
      throw err;
    }
    expect(readPidFile(path)).toBeUndefined();
    expect(writePidFile(path, 1234)).toBe(false);
    expect(readFileSync(target, "utf8")).toBe("4321");
  });
});

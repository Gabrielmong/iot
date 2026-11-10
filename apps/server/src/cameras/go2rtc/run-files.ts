import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeGo2rtcConfig } from "./config.js";
import type { Go2rtcCredentials } from "./credentials.js";
import { removePidFile, writePidFile } from "./pid-file.js";
import { RUN_DIR_PREFIX } from "./stale-runs.js";

type Log = Pick<Console, "warn">;
const code = (err: unknown) => (err as NodeJS.ErrnoException).code ?? "error";

/** The files one supervisor run owns: its temp config folder and the pid file. */
export class RunFiles {
  private dir: string | undefined;
  private config: string | undefined;

  constructor(
    private readonly pidFile: string,
    private readonly tempDir: string,
  ) {}

  get configPath(): string | undefined {
    return this.config;
  }

  get runDir(): string | undefined {
    return this.dir;
  }

  /** Writes this run's config into a fresh folder under the temp dir and returns its path. */
  create(ffmpegPath: string, credentials: Go2rtcCredentials): string {
    this.dir = mkdtempSync(join(this.tempDir, RUN_DIR_PREFIX));
    this.config = writeGo2rtcConfig(this.dir, ffmpegPath, credentials);
    return this.config;
  }

  /** Never throws: a missing pid file only weakens orphan cleanup on the next start. */
  recordPid(pid: number, log: Log): void {
    try {
      if (!writePidFile(this.pidFile, pid)) log.warn("go2rtc: pid file path is not a regular file; not writing it");
    } catch (err) {
      log.warn(`go2rtc: could not write its pid file (${code(err)})`);
    }
  }

  /** Never throws, and each removal is attempted on its own: shutdown must carry on. */
  dispose(log: Log): void {
    try {
      removePidFile(this.pidFile);
    } catch (err) {
      log.warn(`go2rtc: could not remove its pid file (${code(err)})`);
    }
    try {
      if (this.dir) rmSync(this.dir, { recursive: true, force: true });
    } catch (err) {
      log.warn(`go2rtc: could not remove its config folder (${code(err)})`);
    }
    this.dir = undefined;
    this.config = undefined;
  }
}

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { Reconnector } from "../../devices/drivers/reconnector.js";
import type { Go2rtcApi } from "./api.js";
import { binaryExists } from "./binary.js";
import type { Go2rtcCredentials } from "./credentials.js";
import { checkInstance } from "./identity.js";
import { killOrphan } from "./orphan.js";
import { DEFAULT_PID_FILE } from "./pid-file.js";
import { waitUntilReady } from "./readiness.js";
import { RunFiles } from "./run-files.js";
import { removeStaleRunDirs } from "./stale-runs.js";

export interface Go2rtcSupervisorOptions {
  /** go2rtc binary (tests pass `process.execPath` plus a fake script in `args`). */
  command: string;
  /** Leading args; `-config <path>` is appended. */
  args?: string[];
  ffmpegPath: string;
  /** This run's API credentials, written into the config; `api` must use the same ones. */
  credentials: Go2rtcCredentials;
  api: Pick<Go2rtcApi, "info">;
  log: Pick<Console, "info" | "warn" | "error">;
  pollMs?: number;
  readyTimeoutMs?: number;
  pidFile?: string;
  /** Parent of the per-run config folders (default: the OS temp dir). */
  tempDir?: string;
}

type Go2rtcEvents = {
  /** Our go2rtc answers `GET /api`. Its streams are empty: register them all again. */
  ready: [];
  /** go2rtc exited unexpectedly; a restart is scheduled. */
  down: [];
};

const KILL_WAIT_MS = 3_000;

/** Runs go2rtc as a child process: spawn, wait until ready, restart with backoff (1 s, 2 s, 4 s ... 60 s). */
export class Go2rtcSupervisor extends EventEmitter<Go2rtcEvents> {
  private readonly reconnector = new Reconnector(() => this.launch());
  private readonly files: RunFiles;
  private child: ChildProcess | undefined;
  private readyAbort: AbortController | undefined;
  private running = false;
  private stopping = false;
  /** The child killed by `restart()`: its exit respawns at once instead of backing off. */
  private restarting: ChildProcess | undefined;
  /** The child that reached `ready` (the only one that can have media sessions). */
  private readyChild: ChildProcess | undefined;
  /** Last-resort cleanup so the child never outlives the server, even on an unexpected exit. */
  private readonly killOnExit = () => this.child?.kill();

  constructor(private readonly opts: Go2rtcSupervisorOptions) {
    super();
    this.files = new RunFiles(this.pidFile, this.tempDir);
  }

  private get pidFile(): string {
    return this.opts.pidFile ?? DEFAULT_PID_FILE;
  }

  private get tempDir(): string {
    return this.opts.tempDir ?? tmpdir();
  }

  /** False when the binary is missing: cameras are disabled and the server runs without them. */
  get enabled(): boolean {
    return this.running;
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  get configPath(): string | undefined {
    return this.files.configPath;
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!binaryExists(this.opts.command)) {
      this.opts.log.warn(`cameras disabled: go2rtc not found at ${this.opts.command}`);
      return;
    }
    this.running = true;
    this.stopping = false;
    try {
      await killOrphan(this.pidFile, this.opts.command, this.opts.log);
    } catch (err) {
      this.opts.log.warn(`go2rtc: orphan check failed (${(err as NodeJS.ErrnoException).code ?? "error"}); continuing`);
    }
    this.files.create(this.opts.ffmpegPath, this.opts.credentials);
    removeStaleRunDirs(this.tempDir, this.files.runDir!, this.opts.log);
    process.on("exit", this.killOnExit);
    this.launch();
  }

  /** Shutdown has begun: an exit from now on is expected, so nothing restarts or reports `down`. */
  prepareStop(): void {
    this.stopping = true;
    this.reconnector.cancel();
  }

  /**
   * Kills go2rtc and starts it again at once (no backoff). This is the only way to end media sessions
   * already flowing: go2rtc's stream DELETE/PATCH leave connected consumers playing. `down` and then
   * `ready` follow as usual, and `ready` registers every stream again. No-op unless the current child
   * has become ready: one still starting has no media sessions, so repeated requests while a restart
   * is under way never kill it again.
   */
  restart(): void {
    const child = this.child;
    if (!this.running || this.stopping || !child || this.readyChild !== child || this.restarting === child) return;
    this.restarting = child;
    if (!child.kill()) this.opts.log.warn("go2rtc: could not stop it for a restart");
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.prepareStop();
    this.running = false;
    this.readyAbort?.abort();
    const child = this.child;
    this.child = undefined;
    if (child && child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
      const exited = once(child, "exit");
      child.kill();
      await Promise.race([exited, delay(KILL_WAIT_MS)]);
    }
    process.off("exit", this.killOnExit);
    this.files.dispose(this.opts.log);
  }

  private launch(): void {
    const configPath = this.files.configPath;
    if (!this.running || this.stopping || !configPath) return;
    const child = spawn(this.opts.command, [...(this.opts.args ?? []), "-config", configPath], { windowsHide: true, stdio: "ignore" });
    this.child = child;
    if (child.pid !== undefined) this.files.recordPid(child.pid, this.opts.log);
    let gone = false;
    const onGone = (reason: string) => {
      if (gone) return;
      gone = true;
      this.exited(child, reason);
    };
    child.on("error", (err: NodeJS.ErrnoException) => {
      // Also emitted when a kill fails; only a failed spawn means the process is gone.
      if (child.pid === undefined) onGone(`failed to start (${err.code ?? err.message})`);
    });
    child.once("exit", (code, signal) => onGone(`exited (${signal ?? `code ${code}`})`));
    void this.awaitReady(child, configPath);
  }

  private async awaitReady(child: ChildProcess, configPath: string): Promise<void> {
    this.readyAbort?.abort();
    const abort = new AbortController();
    this.readyAbort = abort;
    const result = await waitUntilReady((t) => checkInstance(this.opts.api, configPath, t), {
      pollMs: this.opts.pollMs ?? 250,
      timeoutMs: this.opts.readyTimeoutMs ?? 15_000,
      signal: abort.signal,
    });
    if (!this.running || this.stopping || this.child !== child || abort.signal.aborted) return;
    if (result !== "ready") {
      this.opts.log.warn(
        result === "foreign"
          ? "go2rtc: the API port is held by something that is not this server's go2rtc; restarting it"
          : "go2rtc did not become ready; restarting it",
      );
      child.kill();
      return;
    }
    this.opts.log.info("go2rtc ready");
    this.readyChild = child;
    this.reconnector.connected();
    try {
      this.emit("ready");
    } catch (err) {
      // Only the class: a listener's message could carry a stream source.
      this.opts.log.error(`go2rtc: a ready listener failed (${err instanceof Error ? err.name : "unknown"})`);
    }
  }

  private exited(child: ChildProcess, reason: string): void {
    if (this.child !== child) return;
    this.child = undefined;
    this.readyAbort?.abort();
    if (!this.running || this.stopping) return;
    if (this.restarting === child) {
      this.restarting = undefined;
      this.opts.log.info("go2rtc restarted to end media sessions");
      this.emit("down");
      this.launch();
      return;
    }
    const delayMs = this.reconnector.failed("transient");
    this.opts.log.warn(`go2rtc ${reason}; restarting in ${delayMs / 1000} s`);
    this.emit("down");
  }
}

import type { PanDirection } from "@home/protocols";
import { cameraCloud } from "./cloud-client.js";
import { moveProps, STOP_PROPS } from "./commands.js";
import type { ControlDeps } from "./control-service.js";
import { MoveWatchdog, SAFETY_STOP_MS } from "./watchdog.js";

/** Safety-stop attempts, and the pause between them. */
export const SAFETY_STOP_ATTEMPTS = 3;
export const SAFETY_STOP_RETRY_MS = 2000;

type Issue = (props: Record<string, unknown>) => Promise<void>;
type Camera = { id: string; issue: Issue };

/**
 * Pan commands for each camera, one at a time (a cloud call takes 1-2 s, so a stop must never overtake
 * a move still on its way). A repeat of the move already queued or in flight only renews the safety
 * timer. A stop supersedes every move requested before it. The safety timer is armed before a move is
 * sent and stays armed until a stop succeeds; when it fires, the stop is retried a few times.
 */
class Motion {
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly pending = new Map<string, PanDirection>();
  private readonly stops = new Map<string, number>();
  readonly watchdog: MoveWatchdog;

  constructor(private readonly deps: ControlDeps) {
    this.watchdog = new MoveWatchdog({ timeoutMs: SAFETY_STOP_MS, onExpire: (id) => void this.safetyStop(id) });
  }

  async move(cam: Camera, direction: PanDirection): Promise<void> {
    this.watchdog.touch(cam.id);
    if (this.pending.get(cam.id) === direction) return;
    this.pending.set(cam.id, direction);
    const generation = this.stopsOf(cam.id);
    await this.serial(cam.id, async () => {
      if (this.stopsOf(cam.id) !== generation) return;
      try {
        await cam.issue(moveProps(direction));
      } finally {
        if (this.pending.get(cam.id) === direction) this.pending.delete(cam.id);
      }
    });
    if (this.stopsOf(cam.id) === generation) this.watchdog.touch(cam.id);
  }

  async stop(cam: Camera): Promise<void> {
    this.stops.set(cam.id, this.stopsOf(cam.id) + 1);
    this.pending.delete(cam.id);
    try {
      await this.serial(cam.id, () => cam.issue(STOP_PROPS));
      this.watchdog.clear(cam.id);
    } catch (err) {
      this.watchdog.touch(cam.id);
      throw err;
    }
  }

  private async safetyStop(deviceId: string): Promise<void> {
    const row = await this.deps.prisma.device.findUnique({ where: { id: deviceId } }).catch(() => null);
    if (!row) return;
    const cam: Camera = { id: deviceId, issue: async (p) => (await cameraCloud(this.deps)).issueCameraProperties(row.externalId, p) };
    for (let attempt = 1; attempt <= SAFETY_STOP_ATTEMPTS; attempt++) {
      try {
        await this.stop(cam);
        this.deps.log.info(`camera-controls: safety stop sent to camera ${deviceId}`);
        return;
      } catch (err) {
        this.watchdog.clear(deviceId);
        this.deps.log.warn(`camera-controls: safety stop ${attempt}/${SAFETY_STOP_ATTEMPTS} failed for camera ${deviceId}: ${err instanceof Error ? err.name : "error"}`);
        if (attempt < SAFETY_STOP_ATTEMPTS) await new Promise((r) => setTimeout(r, SAFETY_STOP_RETRY_MS).unref?.());
      }
    }
  }

  private stopsOf(id: string): number {
    return this.stops.get(id) ?? 0;
  }

  private serial<T>(id: string, task: () => Promise<T>): Promise<T> {
    const run = (this.chains.get(id) ?? Promise.resolve()).catch(() => undefined).then(task);
    this.chains.set(id, run);
    void run.catch(() => undefined).finally(() => this.chains.get(id) === run && this.chains.delete(id));
    return run;
  }
}

const motions = new WeakMap<object, Motion>();

/** One per app (keyed by its device manager). */
export function motionFor(deps: ControlDeps): Motion {
  let m = motions.get(deps.manager);
  if (!m) {
    m = new Motion(deps);
    motions.set(deps.manager, m);
  }
  return m;
}

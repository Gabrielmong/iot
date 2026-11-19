import type { PubSubEngine } from "graphql-subscriptions";
import { notFound } from "../api-errors.js";
import type { DeviceManager } from "../devices/manager.js";
import { ROUTINE_RUN, type RoutineRunPayload } from "../devices/topics.js";
import type { PrismaClient, RoutineScope, User } from "../generated/prisma/client.js";
import type { PcPowerRelay } from "../agent/power.js";
import { pcPermissions } from "../services/computer-grants.js";
import { canAccessDevice } from "../services/grants.js";
import { loadCalledRoutine } from "./called-routine-loader.js";
import { cancellableDelay } from "./cancellable-delay.js";
import { saveLastRun, markInterrupted } from "./run-store.js";
import { RoutineRunner, type RunAs, type RunSnapshot } from "./runner.js";
import type { RoutineStep } from "./steps.js";
import { getRoutine } from "./store.js";
import type { WeatherFacts } from "../weather/service.js";

export type RoutineServiceOptions = {
  now: () => Date;
  /** The weather and location condition steps check. */
  weather: () => WeatherFacts;
  log: Pick<Console, "error">;
  /** Tests replace the real timer. */
  delay?: typeof cancellableDelay;
  /** Sleeps / shuts down PCs through their agents. */
  pcPower: Pick<PcPowerRelay, "request">;
};

const TRY_PREFIX = "try:";
export const tryKey = (userId: string) => TRY_PREFIX + userId;
export const isTryKey = (key: string) => key.startsWith(TRY_PREFIX);

/** Runs saved routines and drafts, stores each routine's last run and publishes every change. */
export class RoutineService {
  private readonly runner: RoutineRunner;
  /** Per-key queue so a run's updates are stored and published in order. */
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaClient,
    manager: Pick<DeviceManager, "setState">,
    private readonly pubsub: PubSubEngine,
    private readonly opts: RoutineServiceOptions,
  ) {
    this.runner = new RoutineRunner({
      setState: (id, patch) => manager.setState(id, patch),
      device: (id) => prisma.device.findFirst({ where: { id, adopted: true }, select: { id: true, name: true, kind: true, brand: true } }),
      canAccess: async (userId, deviceId) => {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        return user !== null && canAccessDevice(prisma, user, deviceId);
      },
      canPower: async (userId, deviceId) => {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        return user !== null && (await pcPermissions(prisma, user, deviceId)).power;
      },
      pcPower: (deviceId, action, requestedBy) => void opts.pcPower.request(deviceId, action, requestedBy),
      routine: (id, runAs) =>
        loadCalledRoutine(prisma, id, runAs).catch((error: unknown) => {
          opts.log.error("loading a called routine failed", error);
          throw error;
        }),
      delay: opts.delay ?? cancellableDelay,
      now: opts.now,
      weather: opts.weather,
      onChange: (key, run) => this.enqueue(key, run),
    });
  }

  /** Runs a routine the user can see (restarting it if it's running). */
  async run(routineId: string, user: Pick<User, "id" | "role" | "name">): Promise<void> {
    const row = await getRoutine(this.prisma, user, routineId);
    if (!row) throw notFound("Routine");
    this.startSaved(row, user.name);
  }

  /** Stops a routine the user can see; false if it wasn't running. */
  async stopFor(routineId: string, user: Pick<User, "id" | "role">): Promise<boolean> {
    if (!(await getRoutine(this.prisma, user, routineId))) throw notFound("Routine");
    return this.stop(routineId);
  }

  stop(routineId: string): boolean {
    return this.runner.stop(routineId);
  }

  /** Runs a draft once as `user` (an admin trying a shared draft has full access). Not stored. */
  tryDraft(user: Pick<User, "id" | "role" | "name">, steps: RoutineStep[], scope: RoutineScope, name: string): void {
    const full = scope === "SHARED" && user.role === "ADMIN";
    this.runner.start(tryKey(user.id), steps, full ? null : { userId: user.id }, user.name, name);
  }

  stopTry(userId: string): boolean {
    return this.runner.stop(tryKey(userId));
  }

  /** Scheduler entry point: runs the routine if it still exists. */
  async runScheduled(routineId: string): Promise<void> {
    const row = await this.prisma.routine.findUnique({ where: { id: routineId } });
    if (row) this.startSaved(row, null);
  }

  markInterrupted(): Promise<void> {
    return markInterrupted(this.prisma, this.opts.now());
  }

  stopAll(): void {
    this.runner.stopAll();
  }

  /** Resolves once every queued run update (DB write and publish) is done; call after stopAll on shutdown. */
  async idle(): Promise<void> {
    while (this.queues.size > 0) await Promise.all(this.queues.values());
  }

  /** Shared routines run with full access; personal ones as their owner (an admin owner has full access through their role). */
  private startSaved(row: { id: string; name: string; ownerId: string | null; steps: unknown }, startedBy: string | null): void {
    const runAs: RunAs = row.ownerId ? { userId: row.ownerId } : null;
    this.runner.start(row.id, row.steps as RoutineStep[], runAs, startedBy, row.name);
  }

  private enqueue(key: string, run: RunSnapshot): void {
    const next = (this.queues.get(key) ?? Promise.resolve())
      .then(() => this.record(key, run))
      .catch((error: unknown) => this.opts.log.error("routine run update failed", error));
    this.queues.set(key, next);
    void next.then(() => {
      if (this.queues.get(key) === next) this.queues.delete(key);
    });
  }

  private async record(key: string, run: RunSnapshot): Promise<void> {
    if (!isTryKey(key) && !(await saveLastRun(this.prisma, key, run))) return;
    const payload: RoutineRunPayload = { key, run };
    await this.pubsub.publish(ROUTINE_RUN, payload);
  }
}

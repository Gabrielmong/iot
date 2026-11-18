import type { PowerSource, PrismaClient } from "../../generated/prisma/client.js";

/** How long On/Off changes are kept. */
export const HISTORY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PowerChange = { on: boolean; at: Date };

/** Stored On/Off changes of computers. */
export class PowerHistory {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date,
  ) {}

  /** Stores a change (skipped when the latest stored event already says `on`), then drops the device's expired events. */
  async record(deviceId: string, on: boolean, source: PowerSource = "PROBE"): Promise<void> {
    const latest = await this.prisma.powerEvent.findFirst({ where: { deviceId }, orderBy: { at: "desc" } });
    if (latest?.on === on) return;
    const at = this.now();
    await this.prisma.powerEvent.create({ data: { deviceId, on, at, source } });
    await this.prisma.powerEvent.deleteMany({ where: { deviceId, at: { lt: new Date(at.getTime() - HISTORY_DAYS * DAY_MS) } } });
  }

  /** Changes at or after `since`, plus the latest one before it (the state at `since`), oldest first. */
  async since(deviceId: string, since: Date): Promise<PowerChange[]> {
    const select = { on: true, at: true } as const;
    const [before, after] = await Promise.all([
      this.prisma.powerEvent.findFirst({ where: { deviceId, at: { lt: since } }, orderBy: { at: "desc" }, select }),
      this.prisma.powerEvent.findMany({ where: { deviceId, at: { gte: since } }, orderBy: { at: "asc" }, select }),
    ]);
    return before ? [before, ...after] : after;
  }
}

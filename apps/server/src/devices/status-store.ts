import type { PrismaClient } from "../generated/prisma/client.js";
import type { DeviceStatus } from "./types.js";

/** Writes device statuses reported by drivers, skipping repeats. */
export class StatusStore {
  private readonly known = new Map<string, DeviceStatus>();

  constructor(private readonly prisma: PrismaClient) {}

  /** Returns true when the stored status changed. */
  async set(deviceId: string, status: DeviceStatus): Promise<boolean> {
    if (this.known.get(deviceId) === status) return false;
    const { count } = await this.prisma.device.updateMany({ where: { id: deviceId, status: { not: status } }, data: { status } });
    this.known.set(deviceId, status);
    return count > 0;
  }

  forget(deviceId: string): void {
    this.known.delete(deviceId);
  }
}

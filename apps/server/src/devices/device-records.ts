import type { Device, PrismaClient } from "../generated/prisma/client.js";
import { decryptSecret } from "../secrets.js";
import type { Brand, DeviceRecord, DriverLog } from "./types.js";

/** Reads devices for drivers, decrypting local keys (an undecryptable key is treated as missing). */
export class DeviceRecords {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secretKey: Buffer,
    private readonly log: DriverLog,
  ) {}

  async adopted(brand: Brand): Promise<DeviceRecord[]> {
    const rows = await this.prisma.device.findMany({ where: { adopted: true, brand }, orderBy: { externalId: "asc" } });
    return rows.map((row) => this.decrypt(row));
  }

  async byIds(ids: string[]): Promise<DeviceRecord[]> {
    const rows = await this.prisma.device.findMany({ where: { id: { in: ids } }, orderBy: { externalId: "asc" } });
    return rows.map((row) => this.decrypt(row));
  }

  async byId(deviceId: string): Promise<DeviceRecord | undefined> {
    const row = await this.prisma.device.findUnique({ where: { id: deviceId } });
    return row ? this.decrypt(row) : undefined;
  }

  private decrypt(row: Device): DeviceRecord {
    if (!row.secret) return { ...row };
    try {
      return { ...row, secretPlain: decryptSecret(row.secret, this.secretKey) };
    } catch {
      this.log.warn(`device ${row.id}: stored secret cannot be decrypted`);
      return { ...row };
    }
  }
}

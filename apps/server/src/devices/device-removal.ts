import type { PrismaClient } from "../generated/prisma/client.js";
import { SettingKey } from "../settings-keys.js";

/** Deletes a device, its child devices (power-strip outlets), their grants and stored camera logins, all at once. Returns the deleted ids. */
export async function deleteDeviceTree(prisma: PrismaClient, deviceId: string): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const children = await tx.device.findMany({ where: { parentId: deviceId }, select: { id: true } });
    const ids = [deviceId, ...children.map((c) => c.id)];
    await tx.deviceGrant.deleteMany({ where: { deviceId: { in: ids } } });
    await tx.setting.deleteMany({ where: { key: { in: ids.map(SettingKey.cameraOnvif) } } });
    await tx.device.deleteMany({ where: { id: { in: ids } } });
    return ids;
  });
}

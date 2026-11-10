import { badInput, forbidden } from "../api-errors.js";
import type { PrismaClient, User } from "../generated/prisma/client.js";

/** Every id is an adopted camera that `checkAs` may access (admins: all). */
export async function checkCameras(prisma: PrismaClient, ids: string[], checkAs: Pick<User, "id" | "role">): Promise<void> {
  const rows = await prisma.device.findMany({ where: { id: { in: ids }, adopted: true, kind: "CAMERA" }, select: { id: true, name: true } });
  if (rows.length !== ids.length) throw badInput("Unknown camera");
  if (checkAs.role === "ADMIN") return;
  const granted = new Set((await prisma.deviceGrant.findMany({ where: { userId: checkAs.id, deviceId: { in: ids } } })).map((g) => g.deviceId));
  const missing = rows.find((d) => !granted.has(d.id));
  if (missing) throw forbidden(`No access to ${missing.name}`);
}

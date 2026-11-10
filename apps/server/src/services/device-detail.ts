import type { User } from "../generated/prisma/client.js";
import type { ServiceDeps } from "./deps.js";
import { visibleDevices, type DeviceRow } from "./device-rows.js";

/** One device if the user may see it (adopted, and granted unless admin); otherwise null. */
export async function getVisibleDevice(deps: Pick<ServiceDeps, "prisma">, user: Pick<User, "id" | "role">, id: string): Promise<DeviceRow | null> {
  return (await visibleDevices(deps.prisma, user, id))[0] ?? null;
}

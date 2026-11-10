import { isIPv4 } from "node:net";
import { badInput, coded, notFound } from "../api-errors.js";
import type { Brand } from "../generated/prisma/client.js";
import type { ServiceDeps } from "./deps.js";
import type { DeviceRow } from "./device-rows.js";

/** TV drivers, asked in this order. */
const TV_BRANDS: readonly Brand[] = ["ANDROID_TV", "SAMSUNG", "HISENSE"];

/** Asks each TV driver whether it recognises the TV at `ip` and records the first match like a discovery. */
export async function addTvByIp(deps: Pick<ServiceDeps, "prisma" | "manager">, ip: string): Promise<DeviceRow> {
  const address = ip.trim();
  if (!isIPv4(address)) throw badInput("Enter an IPv4 address");
  const found = await deps.manager.identifyAt(address, TV_BRANDS);
  if (!found) throw coded("DEVICE_UNREACHABLE", `No supported TV answered at ${address}`);
  await deps.manager.recordDiscovered(found);
  const row = await deps.prisma.device.findUnique({
    where: { brand_externalId: { brand: found.brand, externalId: found.externalId } },
    include: { room: true },
  });
  if (!row) throw notFound("Device");
  return row;
}

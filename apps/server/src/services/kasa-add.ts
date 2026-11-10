import { KasaAuthError } from "@home/protocols";
import { isIPv4 } from "node:net";
import { badInput, coded, notFound } from "../api-errors.js";
import { kasaCredentialsFrom } from "../devices/kasa-credentials.js";
import type { Discovered } from "../devices/types.js";
import type { ServiceDeps } from "./deps.js";
import type { DeviceRow } from "./device-rows.js";

/** Identifies the Kasa device at `ip` (needs the TP-Link account) and records it like a discovery. */
export async function addKasaByIp(deps: ServiceDeps, ip: string): Promise<DeviceRow> {
  const address = ip.trim();
  if (!isIPv4(address)) throw badInput("Enter an IPv4 address");
  const creds = await kasaCredentialsFrom(deps.prisma, deps.secretKey)();
  if (!creds) throw badInput("Save the TP-Link credentials first");

  let found: Discovered;
  try {
    found = await deps.kasaProbe(address, creds);
  } catch (err) {
    if (err instanceof KasaAuthError) throw coded("NEEDS_CREDENTIALS", "The device rejected the TP-Link credentials");
    deps.log.warn(`kasa: add by IP ${address} failed`, err); // protocol errors never carry the account
    throw coded("DEVICE_UNREACHABLE", `No Kasa device answered at ${address}`);
  }

  await deps.manager.recordDiscovered(found);
  const row = await deps.prisma.device.findUnique({
    where: { brand_externalId: { brand: "KASA", externalId: found.externalId } },
    include: { room: true },
  });
  if (!row) throw notFound("Device");
  return row;
}

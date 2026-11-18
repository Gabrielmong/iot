import { parseMac } from "@home/protocols";
import { isIPv4 } from "node:net";
import { badInput, notFound } from "../api-errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { publishDevicesChanged } from "../graphql/pubsub.js";
import type { ServiceDeps } from "./deps.js";
import { deviceRow, type DeviceRow } from "./device-rows.js";
import { parseName } from "./user-input.js";

type Deps = Pick<ServiceDeps, "prisma" | "pubsub" | "manager">;
export type ComputerInput = { name: string; roomId?: string | null; mac: string; ip?: string | null };

function macFrom(input: string): string {
  const mac = parseMac(input);
  if (!mac) throw badInput("Enter a MAC address like AA:BB:CC:DD:EE:FF");
  return mac;
}

function ipFrom(input: string | null | undefined): string | null {
  const ip = input?.trim() ?? "";
  if (ip === "") return null;
  if (!isIPv4(ip)) throw badInput("Enter an IPv4 address");
  return ip;
}

async function assertMacFree(prisma: PrismaClient, mac: string, exceptId?: string): Promise<void> {
  const taken = await prisma.device.findUnique({ where: { brand_externalId: { brand: "WOL", externalId: mac } } });
  if (taken && taken.id !== exceptId) throw badInput("That computer is already added");
}

async function finish(deps: Deps, id: string): Promise<DeviceRow> {
  await deps.manager.refresh();
  await publishDevicesChanged(deps.pubsub);
  const row = await deviceRow(deps.prisma, id);
  if (!row) throw notFound("Device");
  return row;
}

/** Adds a computer by hand (computers can't be discovered); it is adopted at once. */
export async function addComputer(deps: Deps, input: ComputerInput): Promise<DeviceRow> {
  const name = parseName(input.name, "Device name");
  const mac = macFrom(input.mac);
  const ip = ipFrom(input.ip);
  if (input.roomId && !(await deps.prisma.room.findUnique({ where: { id: input.roomId } }))) throw badInput("Unknown room");
  await assertMacFree(deps.prisma, mac);
  const row = await deps.prisma.device.create({
    data: { brand: "WOL", kind: "COMPUTER", externalId: mac, name, ip, adopted: true, roomId: input.roomId ?? null, config: { mac } },
  });
  return finish(deps, row.id);
}

/** Changes a computer's MAC or IP (an omitted or empty IP clears it). */
export async function updateComputer(deps: Deps, id: string, input: { mac: string; ip?: string | null }): Promise<DeviceRow> {
  const device = await deps.prisma.device.findUnique({ where: { id } });
  if (!device) throw notFound("Device");
  if (device.brand !== "WOL") throw badInput("Only computers added by MAC can be edited here");
  const mac = macFrom(input.mac);
  const ip = ipFrom(input.ip);
  await assertMacFree(deps.prisma, mac, id);
  // Keep what the probe learned (probeSeen, rdpSeen) unless the PC moved to another IP.
  const learned = device.ip === ip ? ((device.config as Record<string, unknown> | null) ?? {}) : {};
  await deps.prisma.device.update({ where: { id }, data: { externalId: mac, ip, config: { ...learned, mac } } });
  return finish(deps, id);
}

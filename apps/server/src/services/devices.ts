import { recordRemoval } from "../agent/removals.js";
import { badInput, notFound } from "../api-errors.js";
import type { DeviceKind, Prisma, PrismaClient } from "../generated/prisma/client.js";
import { publishDevicesChanged } from "../graphql/pubsub.js";
import type { ServiceDeps } from "./deps.js";
import { deviceRow, type DeviceRow } from "./device-rows.js";
import { parseStatePatch, type StatePatchInput } from "./state-patch.js";
import { parseName } from "./user-input.js";

type Deps = Pick<ServiceDeps, "prisma" | "pubsub" | "manager">;
type RemovalDeps = Deps & Pick<ServiceDeps, "grantEvents" | "agents" | "now">;
/** `roomId: null` unassigns the room; an omitted field is left as it is. */
export type DeviceSettings = { name?: string | null; roomId?: string | null; kind?: DeviceKind | null };

/** Adopts a discovered device: it appears on dashboards and its driver starts controlling it. */
export async function adoptDevice(deps: Deps, id: string, settings: DeviceSettings & { name: string }): Promise<DeviceRow> {
  return saveDevice(deps, id, { ...(await deviceUpdate(deps.prisma, id, settings)), adopted: true });
}

export async function updateDevice(deps: Deps, id: string, settings: DeviceSettings): Promise<DeviceRow> {
  return saveDevice(deps, id, await deviceUpdate(deps.prisma, id, settings));
}

/**
 * Deletes the device with its outlets, grants and stored camera login in one transaction (the device
 * manager re-syncs its drivers), then announces it.
 */
export async function removeDevice(deps: RemovalDeps, id: string): Promise<void> {
  const device = await deps.prisma.device.findUnique({ where: { id } });
  if (!device) throw notFound("Device");
  // A PC's agent uninstalls itself: now if it is connected, else when it next connects (within 90 days).
  if (device.agentTokenHash) await recordRemoval(deps.prisma, device.agentTokenHash, deps.now());
  await deps.manager.removeDevice(id);
  deps.agents.send(id, { t: "uninstall" });
  deps.grantEvents.emit("deviceRemoved", id);
}

/** Sends a command; throws DEVICE_UNREACHABLE, DEVICE_NOT_READY or NOT_FOUND from the manager. */
export async function setDeviceState(deps: Deps, id: string, input: StatePatchInput): Promise<DeviceRow> {
  await deps.manager.setState(id, parseStatePatch(input));
  const row = await deviceRow(deps.prisma, id);
  if (!row) throw notFound("Device");
  return row;
}

async function saveDevice(deps: Deps, id: string, data: Prisma.DeviceUncheckedUpdateInput): Promise<DeviceRow> {
  const { count } = await deps.prisma.device.updateMany({ where: { id }, data });
  if (count === 0) throw notFound("Device");
  await deps.manager.refresh(); // adoption or a kind change alters what the drivers control
  await publishDevicesChanged(deps.pubsub);
  const row = await deviceRow(deps.prisma, id);
  if (!row) throw notFound("Device");
  return row;
}

/** Their drivers fix these kinds: a TV or computer stays one, and nothing else becomes one. */
const DRIVER_KINDS = new Set<DeviceKind>(["TV", "COMPUTER"]);

async function deviceUpdate(prisma: PrismaClient, id: string, s: DeviceSettings): Promise<Prisma.DeviceUncheckedUpdateInput> {
  const data: Prisma.DeviceUncheckedUpdateInput = {};
  if (s.name != null) data.name = parseName(s.name, "Device name");
  if (s.kind != null) {
    const current = (await prisma.device.findUnique({ where: { id }, select: { kind: true } }))?.kind;
    if (current && s.kind !== current && (DRIVER_KINDS.has(current) || DRIVER_KINDS.has(s.kind))) throw badInput("TVs and computers keep their kind");
    data.kind = s.kind;
  }
  if (s.roomId !== undefined) {
    if (s.roomId !== null && !(await prisma.room.findUnique({ where: { id: s.roomId } }))) throw badInput("Unknown room");
    data.roomId = s.roomId;
  }
  return data;
}

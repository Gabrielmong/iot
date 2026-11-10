import { PRESET_SLOTS, type CameraFeatures } from "@home/protocols";
import { badInput } from "../../api-errors.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { asObject } from "../../json.js";
import type { ServiceDeps } from "../../services/deps.js";

export type PresetSlot = { slot: number; saved: boolean };

export function hasPresets(features: CameraFeatures): boolean {
  return Boolean(features.ipc_preset_set && features.ipc_preset_action);
}

export function checkSlot(slot: number): void {
  if (!(PRESET_SLOTS as readonly number[]).includes(slot)) throw badInput(`Position must be ${PRESET_SLOTS[0]}-${PRESET_SLOTS.at(-1)}`);
}

/** The slots saved from this app (the camera can't report which are filled). */
export function savedSlots(config: Prisma.JsonValue): number[] {
  const saved = asObject(config).savedPresets;
  return Array.isArray(saved) ? saved.filter((s): s is number => typeof s === "number") : [];
}

export function presetSlots(config: Prisma.JsonValue): PresetSlot[] {
  const saved = new Set(savedSlots(config));
  return PRESET_SLOTS.map((slot) => ({ slot, saved: saved.has(slot) }));
}

/** Records a saved slot in the device config, inside the manager's write queue. */
export function markSlotSaved(deps: Pick<ServiceDeps, "prisma" | "manager">, deviceId: string, slot: number): Promise<unknown> {
  return deps.manager.runDeviceWrite(async () => {
    const device = await deps.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return;
    const config = asObject(device.config);
    const savedPresets = [...new Set([...savedSlots(device.config), slot])].sort();
    await deps.prisma.device.update({ where: { id: deviceId }, data: { config: { ...config, savedPresets } as Prisma.InputJsonObject } });
  });
}

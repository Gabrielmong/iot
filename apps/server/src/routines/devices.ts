import { badInput, forbidden } from "../api-errors.js";
import type { PrismaClient, User } from "../generated/prisma/client.js";
import { assertActionFits, canUseInRoutine } from "./action-rules.js";
import { stepDeviceIds, type RoutineStep } from "./steps.js";

/**
 * Save-time device checks: every device exists, is adopted and usable in a routine, `checkAs` may
 * access it (admins: all), may sleep / shut down the PCs it does that to, and each action fits what the device supports.
 */
export async function checkDevices(prisma: PrismaClient, steps: RoutineStep[], checkAs: Pick<User, "id" | "role">): Promise<void> {
  const ids = stepDeviceIds(steps);
  const rows = await prisma.device.findMany({
    where: { id: { in: ids }, adopted: true },
    include: { children: { where: { adopted: true }, select: { id: true } } },
  });
  if (rows.length !== ids.length) throw badInput("Unknown device");
  const byId = new Map(rows.map((d) => [d.id, d]));
  for (const d of rows) {
    if (!canUseInRoutine({ kind: d.kind, brand: d.brand, hasAdoptedChildren: d.children.length > 0 })) {
      throw badInput(`${d.name} can't be used in a routine`);
    }
  }
  if (checkAs.role !== "ADMIN") {
    const granted = new Set((await prisma.deviceGrant.findMany({ where: { userId: checkAs.id, deviceId: { in: ids } } })).map((g) => g.deviceId));
    const missing = rows.find((d) => !granted.has(d.id));
    if (missing) throw forbidden(`No access to ${missing.name}`);
    const powered = new Set(steps.flatMap((s) => (s.kind === "SET" ? s.actions.filter((a) => a.pcPower).map((a) => a.deviceId) : [])));
    const mayPower = new Set((await prisma.deviceGrant.findMany({ where: { userId: checkAs.id, deviceId: { in: [...powered] }, power: true } })).map((g) => g.deviceId));
    const refused = rows.find((d) => powered.has(d.id) && !mayPower.has(d.id));
    if (refused) throw forbidden(`You can't sleep or shut down ${refused.name}`);
  }
  for (const step of steps) {
    if (step.kind !== "SET") continue;
    for (const action of step.actions) {
      const d = byId.get(action.deviceId)!;
      assertActionFits(action, { kind: d.kind, brand: d.brand, hasAgent: d.agentTokenHash !== null }, d.name);
    }
  }
}

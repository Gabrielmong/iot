import type { User } from "../generated/prisma/client.js";
import { canEditRoutine } from "../routines/access.js";
import { viewRun, type DeviceVisibility } from "../routines/problem-view.js";
import { toSnapshot } from "../routines/run-store.js";
import { formatTime } from "../routines/schedule.js";
import type { RoutineStep } from "../routines/steps.js";
import { factsOf, type RoutineRow } from "../routines/store.js";
import { toApiRoom, toApiUser } from "./mappers.js";

function toApiStep(step: RoutineStep, exists: ReadonlySet<string>) {
  if (step.kind === "WAIT") return { kind: "WAIT", waitMinutes: step.minutes, actions: [] };
  return {
    kind: "SET",
    waitMinutes: null,
    actions: step.actions.map((a) => ({ deviceId: a.deviceId, deviceExists: exists.has(a.deviceId), on: a.on ?? null, brightness: a.brightness ?? null, color: a.color ?? null, colorTempK: a.colorTempK ?? null })),
  };
}

/**
 * A routine as `viewer` sees it: the audience only for admins, last-run problems on devices they can see.
 * `existing`: ids of adopted devices that still exist.
 */
export function toApiRoutine(row: RoutineRow, viewer: Pick<User, "id" | "role">, canSee: DeviceVisibility, existing: ReadonlySet<string>) {
  const facts = factsOf(row);
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    room: row.room && toApiRoom(row.room),
    owner: row.owner && toApiUser(row.owner),
    steps: (row.steps as RoutineStep[]).map((s) => toApiStep(s, existing)),
    schedules: [...row.schedules]
      .sort((a, b) => a.minuteOfDay - b.minuteOfDay)
      .map((s) => ({ time: formatTime(s.minuteOfDay), days: s.days, enabled: s.enabled })),
    audience: viewer.role === "ADMIN" ? facts.audience : [],
    editable: canEditRoutine(viewer, facts),
    lastRun: row.lastRun && viewRun(toSnapshot(row.lastRun), canSee),
  };
}

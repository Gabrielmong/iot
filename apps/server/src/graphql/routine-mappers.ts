import type { User } from "../generated/prisma/client.js";
import { canEditRoutine } from "../routines/access.js";
import { HIDDEN_ROUTINE_NAME, viewRun, type DeviceVisibility, type RoutineNameVisibility } from "../routines/problem-view.js";
import { toSnapshot } from "../routines/run-store.js";
import { formatTime } from "../routines/schedule.js";
import type { RoutineStep } from "../routines/steps.js";
import { factsOf, type RoutineRow } from "../routines/store.js";
import { toApiRoom, toApiUser } from "./mappers.js";

const NO_CONDITIONS = { conditions: [], thenRoutineId: null, thenRoutineName: null, elseRoutineId: null, elseRoutineName: null };

function toApiStep(step: RoutineStep, exists: ReadonlySet<string>, routineNames: ReadonlyMap<string, string>) {
  const nameOf = (id: string | null) => (id ? (routineNames.get(id) ?? null) : null);
  if (step.kind === "WAIT") return { ...NO_CONDITIONS, kind: "WAIT", waitMinutes: step.minutes, actions: [] };
  if (step.kind === "ROUTINE") return { ...NO_CONDITIONS, kind: "ROUTINE", waitMinutes: null, routineId: step.routineId, routineName: nameOf(step.routineId), actions: [] };
  if (step.kind === "CONTINUE_IF") return { ...NO_CONDITIONS, kind: "CONTINUE_IF", waitMinutes: null, conditions: step.conditions, actions: [] };
  if (step.kind === "IF") {
    const branches = { thenRoutineId: step.thenRoutineId, thenRoutineName: nameOf(step.thenRoutineId), elseRoutineId: step.elseRoutineId, elseRoutineName: nameOf(step.elseRoutineId) };
    return { ...branches, kind: "IF", waitMinutes: null, conditions: step.conditions, actions: [] };
  }
  return {
    ...NO_CONDITIONS,
    kind: "SET",
    waitMinutes: null,
    actions: step.actions.map((a) => ({ deviceId: a.deviceId, deviceExists: exists.has(a.deviceId), on: a.on ?? null, brightness: a.brightness ?? null, color: a.color ?? null, colorTempK: a.colorTempK ?? null, pcPower: a.pcPower ?? null })),
  };
}

/**
 * A routine as `viewer` sees it: the audience only for admins, last-run problems on devices they can see.
 * `existing`: ids of adopted devices that still exist; `routineNames`: names of the routines that still exist and the viewer may see (a hidden one is already "Another routine").
 */
export function toApiRoutine(row: RoutineRow, viewer: Pick<User, "id" | "role">, canSee: DeviceVisibility, canSeeRoutineName: RoutineNameVisibility, existing: ReadonlySet<string>, routineNames: ReadonlyMap<string, string>) {
  const facts = factsOf(row);
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    room: row.room && toApiRoom(row.room),
    owner: row.owner && toApiUser(row.owner),
    steps: (row.steps as RoutineStep[]).map((s) => toApiStep(s, existing, routineNames)),
    schedules: [...row.schedules]
      .sort((a, b) => a.minuteOfDay - b.minuteOfDay || a.anchor.localeCompare(b.anchor) || a.offsetMinutes - b.offsetMinutes)
      .map((s) => ({
        time: s.anchor === "CLOCK" ? formatTime(s.minuteOfDay) : null,
        anchor: s.anchor,
        offsetMinutes: s.offsetMinutes,
        days: s.days,
        enabled: s.enabled,
      })),
    audience: viewer.role === "ADMIN" ? facts.audience : [],
    editable: canEditRoutine(viewer, facts),
    lastRun: row.lastRun && viewRun(toSnapshot(row.lastRun), canSee, canSeeRoutineName),
  };
}

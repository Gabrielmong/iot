import { badInput, forbidden, notFound } from "../api-errors.js";
import type { Prisma, PrismaClient, RoutineScope, User } from "../generated/prisma/client.js";
import { publishRoutinesChanged } from "../graphql/pubsub.js";
import type { ServiceDeps } from "../services/deps.js";
import { refuseGuest } from "../services/guest-rules.js";
import { parseName } from "../services/user-input.js";
import { canEditRoutine, canSeeRoutine, onDashboardOf, type RoutineFacts } from "./access.js";
import { checkCalls } from "./calls.js";
import { checkDevices } from "./devices.js";
import { parseSchedules, type ScheduleInput } from "./schedule.js";
import { parseSteps, type StepInput } from "./steps.js";

type Caller = Pick<User, "id" | "role">;
type Deps = Pick<ServiceDeps, "prisma" | "pubsub" | "routines">;

export type RoutineInput = {
  name: string;
  scope: RoutineScope;
  roomId?: string | null;
  steps: StepInput[];
  schedules: ScheduleInput[];
  audience?: string[] | null;
};

export const ROUTINE_INCLUDE = { room: true, owner: true, schedules: true, audience: true, lastRun: true } as const;
export type RoutineRow = Prisma.RoutineGetPayload<{ include: typeof ROUTINE_INCLUDE }>;

export const factsOf = (r: RoutineRow): RoutineFacts => ({ scope: r.scope, ownerId: r.ownerId, audience: r.audience.map((a) => a.userId) });

const byName = { name: "asc" } as const;

/** The caller's dashboard set: own personal routines plus the shared ones they can see. */
export async function listRoutines(prisma: PrismaClient, user: Caller): Promise<RoutineRow[]> {
  const shared = user.role === "ADMIN" ? { scope: "SHARED" as const } : { scope: "SHARED" as const, audience: { some: { userId: user.id } } };
  const rows = await prisma.routine.findMany({ where: { OR: [{ scope: "PERSONAL", ownerId: user.id }, shared] }, include: ROUTINE_INCLUDE, orderBy: byName });
  return rows.filter((r) => onDashboardOf(user, factsOf(r)));
}

/** Admin: other users' personal routines. */
export function listOtherRoutines(prisma: PrismaClient, admin: Caller): Promise<RoutineRow[]> {
  return prisma.routine.findMany({ where: { scope: "PERSONAL", NOT: { ownerId: admin.id } }, include: ROUTINE_INCLUDE, orderBy: byName });
}

/** The routine if the caller may see it, else null. */
export async function getRoutine(prisma: PrismaClient, user: Caller, id: string): Promise<RoutineRow | null> {
  const row = await prisma.routine.findUnique({ where: { id }, include: ROUTINE_INCLUDE });
  return row && canSeeRoutine(user, factsOf(row)) ? row : null;
}

export async function createRoutine(deps: Deps, user: Caller, input: RoutineInput): Promise<RoutineRow> {
  refuseGuest(user, "create routines");
  if (input.scope === "SHARED" && user.role !== "ADMIN") throw forbidden("Only admins can share routines");
  const ownerId = input.scope === "PERSONAL" ? user.id : null;
  const data = await validated(deps.prisma, input, user, { scope: input.scope, ownerId });
  const row = await deps.prisma.routine.create({
    data: {
      ...data.fields,
      scope: input.scope,
      ownerId,
      createdById: user.id,
      schedules: { create: data.schedules },
      audience: { create: data.audience.map((userId) => ({ userId })) },
    },
    include: ROUTINE_INCLUDE,
  });
  await publishRoutinesChanged(deps.pubsub);
  return row;
}

export async function updateRoutine(deps: Deps, user: Caller, id: string, input: RoutineInput): Promise<RoutineRow> {
  const existing = await editable(deps.prisma, user, id);
  if (input.scope !== existing.scope) throw badInput("A routine can't switch between personal and shared");
  const owner = existing.ownerId ? await deps.prisma.user.findUniqueOrThrow({ where: { id: existing.ownerId } }) : user;
  const data = await validated(deps.prisma, input, owner, { scope: existing.scope, ownerId: existing.ownerId, id });
  deps.routines.stop(id);
  const [, , , row] = await deps.prisma.$transaction([
    deps.prisma.routineSchedule.deleteMany({ where: { routineId: id } }),
    deps.prisma.routineAudience.deleteMany({ where: { routineId: id } }),
    deps.prisma.routine.update({ where: { id }, data: data.fields }),
    deps.prisma.routine.update({
      where: { id },
      data: { schedules: { create: data.schedules }, audience: { create: data.audience.map((userId) => ({ userId })) } },
      include: ROUTINE_INCLUDE,
    }),
  ]);
  await publishRoutinesChanged(deps.pubsub);
  return row;
}

export async function deleteRoutine(deps: Deps, user: Caller, id: string): Promise<void> {
  await editable(deps.prisma, user, id);
  deps.routines.stop(id);
  await deps.prisma.routine.deleteMany({ where: { id } });
  await publishRoutinesChanged(deps.pubsub);
}

/** NOT_FOUND unless visible to the caller, FORBIDDEN unless they may edit it. */
async function editable(prisma: PrismaClient, user: Caller, id: string): Promise<RoutineRow> {
  const row = await getRoutine(prisma, user, id);
  if (!row) throw notFound("Routine");
  if (!canEditRoutine(user, factsOf(row))) throw forbidden("You can't change this routine");
  return row;
}

type Identity = { scope: RoutineScope; ownerId: string | null; id?: string };

/** Parses and checks an input; devices are checked against `checkAs` (the owner, or the admin for shared). */
async function validated(prisma: PrismaClient, input: RoutineInput, checkAs: Caller, who: Identity) {
  const name = parseName(input.name, "Routine name");
  const steps = parseSteps(input.steps);
  const schedules = parseSchedules(input.schedules);
  const roomId = input.roomId ?? null;
  if (roomId && !(await prisma.room.findUnique({ where: { id: roomId } }))) throw badInput("Unknown room");
  await checkDevices(prisma, steps, checkAs);
  await checkCalls(prisma, steps, checkAs, { ...who, name });
  await assertUniqueName(prisma, name, who);
  const audience = who.scope === "SHARED" ? await parseAudience(prisma, input.audience ?? []) : [];
  return { fields: { name, roomId, steps }, schedules, audience };
}

async function assertUniqueName(prisma: PrismaClient, name: string, who: Identity): Promise<void> {
  const clash = await prisma.routine.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, scope: who.scope, ownerId: who.ownerId, ...(who.id ? { NOT: { id: who.id } } : {}) },
  });
  if (clash) throw badInput(`There's already a routine called ${name}`);
}

/** Audience members must be existing regular users (admins see everything anyway). */
async function parseAudience(prisma: PrismaClient, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  const count = await prisma.user.count({ where: { id: { in: unique }, role: { in: ["USER", "GUEST"] } } });
  if (count !== unique.length) throw badInput("Share with regular users or guests only");
  return unique;
}

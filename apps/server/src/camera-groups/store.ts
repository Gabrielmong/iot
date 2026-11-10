import { badInput, forbidden, notFound } from "../api-errors.js";
import type { Prisma, PrismaClient, RoutineScope, User } from "../generated/prisma/client.js";
import { publishCameraGroupsChanged } from "../graphql/pubsub.js";
import { canEditRoutine, canSeeRoutine, onDashboardOf, type RoutineFacts } from "../routines/access.js";
import type { ServiceDeps } from "../services/deps.js";
import { refuseGuest } from "../services/guest-rules.js";
import { checkCameras } from "./members.js";
import { parseGroupInput, type GroupFields } from "./validate.js";

type Caller = Pick<User, "id" | "role">;
type Deps = Pick<ServiceDeps, "prisma" | "pubsub">;

export type CameraGroupInput = GroupFields & { scope: RoutineScope; audience?: string[] | null };

export const GROUP_INCLUDE = { owner: true, audience: true, members: { orderBy: { position: "asc" } } } as const;
export type CameraGroupRow = Prisma.CameraGroupGetPayload<{ include: typeof GROUP_INCLUDE }>;

/** The same visibility facts routines use, so sharing works identically. */
export const groupFacts = (g: CameraGroupRow): RoutineFacts => ({ scope: g.scope, ownerId: g.ownerId, audience: g.audience.map((a) => a.userId) });

/** The caller's groups: own personal ones first, then shared ones they can see, each by name. */
export async function listGroups(prisma: PrismaClient, user: Caller): Promise<CameraGroupRow[]> {
  const shared = user.role === "ADMIN" ? { scope: "SHARED" as const } : { scope: "SHARED" as const, audience: { some: { userId: user.id } } };
  const rows = await prisma.cameraGroup.findMany({ where: { OR: [{ scope: "PERSONAL", ownerId: user.id }, shared] }, include: GROUP_INCLUDE, orderBy: { name: "asc" } });
  const visible = rows.filter((g) => onDashboardOf(user, groupFacts(g)));
  return [...visible.filter((g) => g.scope === "PERSONAL"), ...visible.filter((g) => g.scope === "SHARED")];
}

/** Admin: other users' personal groups, by name. */
export function listOtherGroups(prisma: PrismaClient, admin: Caller): Promise<CameraGroupRow[]> {
  return prisma.cameraGroup.findMany({ where: { scope: "PERSONAL", NOT: { ownerId: admin.id } }, include: GROUP_INCLUDE, orderBy: { name: "asc" } });
}

export async function createGroup(deps: Deps, user: Caller, input: CameraGroupInput): Promise<CameraGroupRow> {
  refuseGuest(user, "create camera groups");
  if (input.scope === "SHARED" && user.role !== "ADMIN") throw forbidden("Only admins can share camera groups");
  const ownerId = input.scope === "PERSONAL" ? user.id : null;
  const data = await validated(deps.prisma, input, user, { scope: input.scope, ownerId });
  const row = await deps.prisma.cameraGroup.create({
    data: { name: data.name, layout: data.layout, scope: input.scope, ownerId, createdById: user.id, members: { create: data.members }, audience: { create: data.audience } },
    include: GROUP_INCLUDE,
  });
  await publishCameraGroupsChanged(deps.pubsub);
  return row;
}

export async function updateGroup(deps: Deps, user: Caller, id: string, input: CameraGroupInput): Promise<CameraGroupRow> {
  const existing = await editable(deps.prisma, user, id);
  if (input.scope !== existing.scope) throw badInput("A group can't switch between personal and shared");
  const owner = existing.ownerId ? await deps.prisma.user.findUniqueOrThrow({ where: { id: existing.ownerId } }) : user;
  const data = await validated(deps.prisma, input, owner, { scope: existing.scope, ownerId: existing.ownerId, id });
  const [, , row] = await deps.prisma.$transaction([
    deps.prisma.cameraGroupMember.deleteMany({ where: { groupId: id } }),
    deps.prisma.cameraGroupAudience.deleteMany({ where: { groupId: id } }),
    deps.prisma.cameraGroup.update({
      where: { id },
      data: { name: data.name, layout: data.layout, members: { create: data.members }, audience: { create: data.audience } },
      include: GROUP_INCLUDE,
    }),
  ]);
  await publishCameraGroupsChanged(deps.pubsub);
  return row;
}

export async function deleteGroup(deps: Deps, user: Caller, id: string): Promise<void> {
  await editable(deps.prisma, user, id);
  await deps.prisma.cameraGroup.deleteMany({ where: { id } });
  await publishCameraGroupsChanged(deps.pubsub);
}

/** NOT_FOUND unless visible to the caller, FORBIDDEN unless they may edit it. */
async function editable(prisma: PrismaClient, user: Caller, id: string): Promise<CameraGroupRow> {
  const row = await prisma.cameraGroup.findUnique({ where: { id }, include: GROUP_INCLUDE });
  if (!row || !canSeeRoutine(user, groupFacts(row))) throw notFound("Camera group");
  if (!canEditRoutine(user, groupFacts(row))) throw forbidden("You can't change this group");
  return row;
}

type Identity = { scope: RoutineScope; ownerId: string | null; id?: string };

/** Parses the input; cameras are checked against `checkAs` (the owner, or the admin for shared groups). */
async function validated(prisma: PrismaClient, input: CameraGroupInput, checkAs: Caller, who: Identity) {
  const fields = parseGroupInput(input);
  await checkCameras(prisma, fields.cameraIds, checkAs);
  const clash = await prisma.cameraGroup.findFirst({
    where: { name: { equals: fields.name, mode: "insensitive" }, scope: who.scope, ownerId: who.ownerId, ...(who.id ? { NOT: { id: who.id } } : {}) },
  });
  if (clash) throw badInput(`There's already a group called ${fields.name}`);
  const audience = who.scope === "SHARED" ? await parseAudience(prisma, input.audience ?? []) : [];
  return {
    name: fields.name,
    layout: fields.layout,
    members: fields.cameraIds.map((deviceId, position) => ({ deviceId, position })),
    audience: audience.map((userId) => ({ userId })),
  };
}

/** Audience members must be existing regular users (admins see everything anyway). */
async function parseAudience(prisma: PrismaClient, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if ((await prisma.user.count({ where: { id: { in: unique }, role: "USER" } })) !== unique.length) throw badInput("Share with regular users only");
  return unique;
}

import type { User } from "../generated/prisma/client.js";
import { groupFacts, type CameraGroupRow } from "../camera-groups/store.js";
import type { DeviceVisibility } from "../routines/problem-view.js";
import { canEditRoutine } from "../routines/access.js";
import { toApiUser } from "./mappers.js";

/** A group as `viewer` sees it: only cameras they can see (in order), the audience only for admins. */
export function toApiCameraGroup(row: CameraGroupRow, viewer: Pick<User, "id" | "role">, canSee: DeviceVisibility) {
  const facts = groupFacts(row);
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    owner: row.owner && toApiUser(row.owner),
    layout: row.layout,
    cameraIds: row.members.map((m) => m.deviceId).filter(canSee),
    audience: viewer.role === "ADMIN" ? facts.audience : [],
    editable: canEditRoutine(viewer, facts),
  };
}

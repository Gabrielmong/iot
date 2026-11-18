import type { ComputerInfo } from "../devices/computers/computer-info.js";
import type { TvInfo } from "../devices/tv-control.js";
import type { DeviceState } from "../devices/types.js";
import type { Room, User } from "../generated/prisma/client.js";
import type { DeviceRow } from "../services/device-rows.js";
import { testBlockedReason } from "../services/test-reason.js";

/**
 * Prisma rows → API shapes. Every field is listed explicitly, so a column added later (or a secret
 * such as pinHash or Device.secret) can never reach a client by accident.
 */

export type ApiUser = Pick<User, "id" | "name" | "avatarColor" | "avatarImage" | "role"> & { hasPin: boolean };
export type ApiRoom = Pick<Room, "id" | "name" | "sortOrder">;

export const toApiUser = (u: User): ApiUser => ({ id: u.id, name: u.name, avatarColor: u.avatarColor, avatarImage: u.avatarImage, role: u.role, hasPin: u.pinHash !== null });

export const toApiRoom = (r: Room): ApiRoom => ({ id: r.id, name: r.name, sortOrder: r.sortOrder });

export function toApiState(s: DeviceState) {
  const light = s.light && {
    on: s.light.on,
    brightness: s.light.brightness,
    mode: s.light.mode,
    color: s.light.color ? { r: s.light.color.r, g: s.light.color.g, b: s.light.color.b } : null,
    colorTempK: s.light.colorTempK ?? null,
  };
  return { online: s.online, on: s.on ?? null, light: light ?? null };
}

/** `ip` is shown to admins only; `connection` is CLOUD exactly when the camera streams through the cloud. */
export function toApiDevice(d: DeviceRow, state: DeviceState, viewer: Pick<User, "role"> = { role: "USER" }, tv: TvInfo | null = null, computer: ComputerInfo | null = null) {
  return {
    id: d.id,
    name: d.name,
    brand: d.brand,
    kind: d.kind,
    model: d.model,
    room: d.room && toApiRoom(d.room),
    parentId: d.parentId,
    state: toApiState(state),
    status: d.status,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    connection: d.streamSource === "CLOUD" ? ("CLOUD" as const) : ("LOCAL" as const),
    streamSource: d.streamSource,
    ip: viewer.role === "ADMIN" ? d.ip : null,
    tv,
    computer,
  };
}

/** Live facts the admin view adds to a device row. */
export type AdminDeviceFacts = { online: boolean; now: Date };

/**
 * `hasKey` says whether a local key is stored; the key itself never leaves the server. `testable` and
 * `testBlockedReason` only apply to un-adopted devices (adopted ones are controlled normally).
 */
export function toApiAdminDevice(d: DeviceRow, facts: AdminDeviceFacts) {
  const reason = d.adopted ? null : testBlockedReason(d, facts.now)
  return {
    id: d.id,
    name: d.name,
    brand: d.brand,
    kind: d.kind,
    model: d.model,
    ip: d.ip,
    adopted: d.adopted,
    room: d.room && toApiRoom(d.room),
    parentId: d.parentId,
    status: d.status,
    hasKey: d.secret !== null,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    online: facts.online,
    testable: !d.adopted && reason === null,
    testBlockedReason: reason,
    mac: d.brand === "WOL" ? macOfConfig(d.config) : null,
  };
}

function macOfConfig(config: unknown): string | null {
  const mac = (config as { mac?: unknown } | null)?.mac;
  return typeof mac === "string" ? mac : null;
}

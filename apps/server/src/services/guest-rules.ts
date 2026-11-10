import { forbidden } from "../api-errors.js";
import type { DeviceKind, User } from "../generated/prisma/client.js";

export const isGuest = (u: Pick<User, "role">): boolean => u.role === "GUEST";

/** Device kinds a guest can never be given or see. */
export const GUEST_HIDDEN_KINDS: readonly DeviceKind[] = ["CAMERA", "COMPUTER"];

export const hiddenFromGuests = (kind: DeviceKind): boolean => GUEST_HIDDEN_KINDS.includes(kind);

/** The BAD_USER_INPUT message for granting a guest a device of this kind. */
export const guestRefusalFor = (kind: DeviceKind): string => (kind === "CAMERA" ? "Guests can't have cameras" : "Guests can't have computers");

/** Throws FORBIDDEN when the caller is a guest. `what` completes "Guests can't ...". */
export function refuseGuest(u: Pick<User, "role">, what: string): void {
  if (isGuest(u)) throw forbidden(`Guests can't ${what}`);
}

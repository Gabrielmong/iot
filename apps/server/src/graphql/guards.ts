import { forbidden, unauthenticated } from "../api-errors.js";
import type { User } from "../generated/prisma/client.js";
import { canAccessDevice } from "../services/grants.js";
import type { ApiContext } from "./context.js";

/** Throws UNAUTHENTICATED without a valid session. */
export function requireUser(ctx: ApiContext): User {
  if (!ctx.user) throw unauthenticated();
  return ctx.user;
}

/** Throws FORBIDDEN for a USER. */
export function requireAdmin(ctx: ApiContext): User {
  const user = requireUser(ctx);
  if (user.role !== "ADMIN") throw forbidden("Admins only");
  return user;
}

/** Throws FORBIDDEN unless the user is an admin or holds a grant for the device. */
export async function requireDeviceAccess(ctx: ApiContext, deviceId: string): Promise<User> {
  const user = requireUser(ctx);
  if (!(await canAccessDevice(ctx.prisma, user, deviceId))) throw forbidden("You do not have access to this device");
  return user;
}

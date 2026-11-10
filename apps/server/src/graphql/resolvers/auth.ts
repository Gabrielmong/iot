import { loginGuest } from "../../auth/guest-login.js";
import { login } from "../../auth/login.js";
import { signOut } from "../../services/sessions.js";
import { listUsers } from "../../services/users.js";
import type { ApiContext } from "../context.js";
import { requireUser } from "../guards.js";
import { toApiUser } from "../mappers.js";

type LoginArgs = { userId: string; pin: string; shared: boolean };

export const authResolvers = {
  Query: {
    /** Public: the user picker. */
    loginUsers: async (_: unknown, __: unknown, ctx: ApiContext) => (await listUsers(ctx.prisma)).map(toApiUser),
    me: (_: unknown, __: unknown, ctx: ApiContext) => toApiUser(requireUser(ctx)),
  },
  Mutation: {
    login: async (_: unknown, { userId, pin, shared }: LoginArgs, ctx: ApiContext) => {
      const { token, user } = await login(ctx.prisma, userId, pin, shared, ctx.deps.now());
      return { token, user: toApiUser(user) };
    },
    loginGuest: async (_: unknown, { userId, shared }: { userId: string; shared: boolean }, ctx: ApiContext) => {
      const { token, user } = await loginGuest(ctx.prisma, userId, shared, ctx.deps.now());
      return { token, user: toApiUser(user) };
    },
    logout: async (_: unknown, __: unknown, ctx: ApiContext) => {
      requireUser(ctx);
      if (ctx.token) await signOut(ctx.deps, ctx.token);
      return true;
    },
  },
};

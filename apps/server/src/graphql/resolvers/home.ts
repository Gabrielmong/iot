import { getHomeName, setHomeName } from "../../services/home-name.js";
import type { ApiContext } from "../context.js";
import { requireAdmin } from "../guards.js";

export const homeResolvers = {
  Query: {
    /** Public: the login screen shows it. */
    homeName: (_: unknown, __: unknown, ctx: ApiContext) => getHomeName(ctx.prisma),
  },
  Mutation: {
    setHomeName: (_: unknown, { name }: { name: string }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return setHomeName(ctx.prisma, name);
    },
  },
};

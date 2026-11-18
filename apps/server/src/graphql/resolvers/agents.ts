import { createEnrollment } from "../../agent/enrollment.js";
import type { ApiContext } from "../context.js";
import { requireAdmin } from "../guards.js";

/** "Adopt this PC": an admin gets a one-time download link for the agent. */
export const agentResolvers = {
  Mutation: {
    createAgentEnrollment: async (_: unknown, __: unknown, ctx: ApiContext) => {
      const admin = requireAdmin(ctx);
      const { code, expiresAt } = await createEnrollment(ctx.deps.prisma, admin.id, ctx.deps.now());
      return { downloadUrl: `/agent/download/${code}`, expiresAt: expiresAt.toISOString() };
    },
  },
};

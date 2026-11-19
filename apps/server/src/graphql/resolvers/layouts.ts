import { effectiveLayouts, resetLayout, saveLayout } from "../../services/dashboard-layouts.js";
import { toLayoutItems, type LayoutItemInput } from "../../services/layout-items.js";
import type { ApiContext } from "../context.js";
import { requireAdmin, requireUser } from "../guards.js";

type SaveArgs = { tab: string; items: LayoutItemInput[]; asDefault?: boolean | null };

export const layoutResolvers = {
  Query: {
    dashboardLayouts: (_: unknown, __: unknown, ctx: ApiContext) => effectiveLayouts(ctx.prisma, requireUser(ctx)),
  },
  Mutation: {
    saveDashboardLayout: (_: unknown, { tab, items, asDefault }: SaveArgs, ctx: ApiContext) => {
      const user = asDefault ? requireAdmin(ctx) : requireUser(ctx);
      return saveLayout(ctx.prisma, user, tab, toLayoutItems(items), Boolean(asDefault));
    },
    resetDashboardLayout: (_: unknown, { tab }: { tab: string }, ctx: ApiContext) => resetLayout(ctx.prisma, requireUser(ctx), tab),
  },
};

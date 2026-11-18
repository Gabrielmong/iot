import type { ComputerInfo } from "../../devices/computers/computer-info.js";
import { readAgentInfo } from "../../agent/agent-store.js";
import { viewerHasAgent, viewerIps } from "../../agent/viewer-pc.js";
import { badInput } from "../../api-errors.js";
import { addComputer, updateComputer, type ComputerInput } from "../../services/computers.js";
import { adminDeviceView } from "../admin-device.js";
import type { ApiContext } from "../context.js";
import { requireAdmin, requireUser } from "../guards.js";

/** Computers are added and edited by hand (admin only); waking goes through setDeviceState. */
export const computerResolvers = {
  Device: {
    /** Only confirmable PCs have a history: an unseen PC's probe can't tell Off from firewalled. */
    powerHistory: async (parent: { id: string; kind: string; computer: ComputerInfo | null }, { since }: { since: string }, ctx: ApiContext) => {
      const from = new Date(since);
      if (Number.isNaN(from.getTime())) throw badInput("since must be an ISO date-time");
      if (parent.kind !== "COMPUTER" || !parent.computer?.confirmable) return [];
      const events = await ctx.manager.history.since(parent.id, from);
      return events.map((e) => ({ on: e.on, at: e.at.toISOString() }));
    },
  },
  Query: {
    publishedAgentVersion: (_: unknown, __: unknown, ctx: ApiContext) => {
      requireAdmin(ctx);
      return readAgentInfo(ctx.agentDir)?.version ?? null;
    },
    remoteDesktopLaunch: (_: unknown, __: unknown, ctx: ApiContext) => {
      requireUser(ctx);
      return viewerHasAgent(ctx.prisma, viewerIps(ctx.remoteAddress));
    },
  },
  Mutation: {
    addComputer: async (_: unknown, args: ComputerInput, ctx: ApiContext) => {
      requireAdmin(ctx);
      return adminDeviceView(ctx)(await addComputer(ctx.deps, args));
    },
    updateComputer: async (_: unknown, { id, mac, ip }: { id: string; mac: string; ip?: string | null }, ctx: ApiContext) => {
      requireAdmin(ctx);
      return adminDeviceView(ctx)(await updateComputer(ctx.deps, id, { mac, ip }));
    },
  },
};

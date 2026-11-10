import { addComputer, updateComputer, type ComputerInput } from "../../services/computers.js";
import { adminDeviceView } from "../admin-device.js";
import type { ApiContext } from "../context.js";
import { requireAdmin } from "../guards.js";

/** Computers are added and edited by hand (admin only); waking goes through setDeviceState. */
export const computerResolvers = {
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

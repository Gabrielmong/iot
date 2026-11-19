import { badInput } from "../api-errors.js";
import type { PrismaClient, User } from "../generated/prisma/client.js";
import { visibleDevices } from "./device-rows.js";
import { validateLayoutItems, type LayoutItem } from "./layout-items.js";

export const ALL_TAB = "all";

/** A tab's arrangement as the caller sees it: their own, or the admin default (`isDefault`). */
export type ApiLayout = { tab: string; items: LayoutItem[]; isDefault: boolean };

type Caller = Pick<User, "id" | "role">;

async function visibleIds(prisma: PrismaClient, user: Caller): Promise<Set<string>> {
  return new Set((await visibleDevices(prisma, user)).map((d) => d.id));
}

/** Widgets are for everyone; devices only when the user can see them. */
const onlyVisible = (items: LayoutItem[], ids: Set<string>) => items.filter((i) => i.deviceId === undefined || ids.has(i.deviceId));

async function requireTab(prisma: PrismaClient, tab: string): Promise<void> {
  if (tab === ALL_TAB) return;
  if (!(await prisma.room.findUnique({ where: { id: tab } }))) throw badInput("Unknown tab");
}

/** Every tab that has an arrangement for this user (override first, else default), filtered to devices they can see. */
export async function effectiveLayouts(prisma: PrismaClient, user: Caller): Promise<ApiLayout[]> {
  const [own, defaults, ids] = await Promise.all([
    prisma.userDashboardLayout.findMany({ where: { userId: user.id } }),
    prisma.defaultDashboardLayout.findMany(),
    visibleIds(prisma, user),
  ]);
  const byTab = new Map<string, ApiLayout>();
  for (const d of defaults) byTab.set(d.tab, { tab: d.tab, items: d.items as LayoutItem[], isDefault: true });
  for (const o of own) byTab.set(o.tab, { tab: o.tab, items: o.items as LayoutItem[], isDefault: false });
  return [...byTab.values()].map((l) => ({ ...l, items: onlyVisible(l.items, ids) })).sort((a, b) => a.tab.localeCompare(b.tab));
}

/**
 * Saves the caller's arrangement of a tab, or (admins, `asDefault`) the default, which also clears the
 * admin's own override so they see what everyone gets. Unknown or inaccessible devices are dropped.
 */
export async function saveLayout(prisma: PrismaClient, user: Caller, tab: string, items: LayoutItem[], asDefault: boolean): Promise<ApiLayout> {
  validateLayoutItems(items);
  await requireTab(prisma, tab);
  const kept = onlyVisible(items, await visibleIds(prisma, user));
  if (asDefault) {
    await prisma.$transaction([
      prisma.defaultDashboardLayout.upsert({ where: { tab }, create: { tab, items: kept }, update: { items: kept } }),
      prisma.userDashboardLayout.deleteMany({ where: { userId: user.id, tab } }),
    ]);
  } else {
    const key = { userId_tab: { userId: user.id, tab } };
    await prisma.userDashboardLayout.upsert({ where: key, create: { userId: user.id, tab, items: kept }, update: { items: kept } });
  }
  return { tab, items: kept, isDefault: asDefault };
}

/** Deletes the caller's override of a tab; returns the default now in effect, or null. */
export async function resetLayout(prisma: PrismaClient, user: Caller, tab: string): Promise<ApiLayout | null> {
  await prisma.userDashboardLayout.deleteMany({ where: { userId: user.id, tab } });
  const fallback = await prisma.defaultDashboardLayout.findUnique({ where: { tab } });
  if (!fallback) return null;
  return { tab, items: onlyVisible(fallback.items as LayoutItem[], await visibleIds(prisma, user)), isDefault: true };
}

/** Removes every arrangement of a tab (used when its room is deleted). */
export async function deleteTabLayouts(prisma: PrismaClient, tab: string): Promise<void> {
  await prisma.$transaction([
    prisma.userDashboardLayout.deleteMany({ where: { tab } }),
    prisma.defaultDashboardLayout.deleteMany({ where: { tab } }),
  ]);
}

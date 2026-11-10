import { badInput } from "../api-errors.js";

export type TileSize = "S1x1" | "W2x1" | "T1x2" | "L2x2";

/** One card of a dashboard arrangement, in display order. */
export type LayoutItem = { deviceId: string; size: TileSize };

export const MAX_LAYOUT_ITEMS = 500;

/** Rejects a device listed twice or more than 500 items; returns the items unchanged otherwise. */
export function validateLayoutItems(items: LayoutItem[]): LayoutItem[] {
  if (items.length > MAX_LAYOUT_ITEMS) throw badInput("Too many items");
  if (new Set(items.map((i) => i.deviceId)).size !== items.length) throw badInput("Duplicate device in layout");
  return items;
}

import { badInput } from "../api-errors.js";

export type TileSize = "S1x1" | "W2x1" | "T1x2" | "L2x2";
/** A non-device card: the weather, or sunrise/sunset. */
export type WidgetKind = "WEATHER" | "SUN";

/** One card of a dashboard arrangement, in display order: a device or a widget. */
export type LayoutItem = { deviceId: string; widget?: undefined; size: TileSize } | { widget: WidgetKind; deviceId?: undefined; size: TileSize };
/** A card as the API sends it in: GraphQL nulls for the field it doesn't use. */
export type LayoutItemInput = { deviceId?: string | null; widget?: WidgetKind | null; size: TileSize };

export const MAX_LAYOUT_ITEMS = 500;

/** Turns API input into items; an item needs exactly one of a device and a widget. */
export function toLayoutItems(input: LayoutItemInput[]): LayoutItem[] {
  return input.map(({ deviceId, widget, size }) => {
    if ((deviceId == null) === (widget == null)) throw badInput("Each item needs a device or a widget");
    return deviceId != null ? { deviceId, size } : { widget: widget as WidgetKind, size };
  });
}

/** Rejects malformed items, a device or widget listed twice, or more than 500 items; returns the items unchanged otherwise. */
export function validateLayoutItems(items: LayoutItem[]): LayoutItem[] {
  if (items.length > MAX_LAYOUT_ITEMS) throw badInput("Too many items");
  toLayoutItems(items);
  const devices = items.flatMap((i) => (i.deviceId !== undefined ? [i.deviceId] : []));
  const widgets = items.flatMap((i) => (i.widget !== undefined ? [i.widget] : []));
  if (new Set(devices).size !== devices.length) throw badInput("Duplicate device in layout");
  if (new Set(widgets).size !== widgets.length) throw badInput("Duplicate widget in layout");
  return items;
}

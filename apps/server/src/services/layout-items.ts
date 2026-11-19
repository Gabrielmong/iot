import { badInput } from "../api-errors.js";

export type TileSize = "S1x1" | "W2x1" | "T1x2" | "L2x2";
/** A non-device card. ROUTINE, CAMERA and ROOM point at a target (a routine, a camera device, a room). */
export type WidgetKind = "WEATHER" | "SUN" | "ROUTINE" | "CAMERA" | "ROOM" | "CLOCK" | "RAIN_SOON" | "MOON" | "OFFLINE";

const NEEDS_TARGET: ReadonlySet<WidgetKind> = new Set(["ROUTINE", "CAMERA", "ROOM"]);

/** A placed widget: `widgetId` tells instances of one kind apart (widgets saved before instances use their kind). */
export type WidgetItem = { widget: WidgetKind; widgetId: string; targetId?: string; deviceId?: undefined; size: TileSize };

/** One card of a dashboard arrangement, in display order: a device or a widget. */
export type LayoutItem = { deviceId: string; widget?: undefined; size: TileSize } | WidgetItem;
/** A card as the API sends it in: GraphQL nulls for the fields it doesn't use. */
export type LayoutItemInput = { deviceId?: string | null; widget?: WidgetKind | null; widgetId?: string | null; targetId?: string | null; size: TileSize };

/** A stored or sent widget with its id filled in (the kind, for widgets saved before instances) and no null target. */
export function toWidgetItem(widget: WidgetKind, widgetId: string | null | undefined, targetId: string | null | undefined, size: TileSize): WidgetItem {
  return { widget, widgetId: widgetId ?? widget, ...(targetId != null ? { targetId } : {}), size };
}

export const MAX_LAYOUT_ITEMS = 500;

/** Turns API input into items; an item needs exactly one of a device and a widget. */
export function toLayoutItems(input: LayoutItemInput[]): LayoutItem[] {
  return input.map(({ deviceId, widget, widgetId, targetId, size }) => {
    if ((deviceId == null) === (widget == null)) throw badInput("Each item needs a device or a widget");
    return deviceId != null ? { deviceId, size } : toWidgetItem(widget as WidgetKind, widgetId, targetId, size);
  });
}

/**
 * Rejects malformed items, a device or widget instance listed twice, a routine / camera / room widget
 * without a target (or another widget with one), or more than 500 items; returns the items unchanged otherwise.
 */
export function validateLayoutItems(items: LayoutItem[]): LayoutItem[] {
  if (items.length > MAX_LAYOUT_ITEMS) throw badInput("Too many items");
  toLayoutItems(items);
  for (const i of items) {
    if (i.widget !== undefined && NEEDS_TARGET.has(i.widget) !== (i.targetId != null)) throw badInput("This widget needs a target");
  }
  const devices = items.flatMap((i) => (i.deviceId !== undefined ? [i.deviceId] : []));
  const widgets = items.flatMap((i) => (i.widget !== undefined ? [i.widgetId] : []));
  if (new Set(devices).size !== devices.length) throw badInput("Duplicate device in layout");
  if (new Set(widgets).size !== widgets.length) throw badInput("Duplicate widget in layout");
  return items;
}

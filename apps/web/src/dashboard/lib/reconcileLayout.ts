import type { WidgetKind } from '../widgets/widgetKinds'
import type { Device } from '../types'
import type { TileSize } from './tileSize'

/** A placed widget: `widgetId` tells instances apart; ROUTINE / CAMERA / ROOM carry the `targetId` they show. */
export type WidgetEntry = { widget: WidgetKind; widgetId: string; targetId?: string; size: TileSize }

/** One stored card of an arrangement: a device or a widget. */
export type LayoutEntry = { deviceId: string; size: TileSize } | WidgetEntry

/** A placed widget as a card to render. */
export type WidgetTileInfo = { key: string; size: TileSize; widget: WidgetKind; widgetId: string; targetId?: string }

/** A card to render, keyed like its entry: the live device or a widget, and its size. */
export type ArrangedTile = { key: string; size: TileSize; device: Device } | WidgetTileInfo

/** A widget's key: `widget:<id>`. Never clashes with a device id. */
export const widgetKey = (widgetId: string) => `widget:${widgetId}`

/** The key an entry is moved and resized by: the device id, or `widget:<id>`. */
export function entryKey(entry: LayoutEntry): string {
  return 'widget' in entry ? widgetKey(entry.widgetId) : entry.deviceId
}

const widgetTile = (e: WidgetEntry): WidgetTileInfo => ({
  key: widgetKey(e.widgetId),
  widget: e.widget,
  widgetId: e.widgetId,
  ...(e.targetId !== undefined ? { targetId: e.targetId } : {}),
  size: e.size,
})

/**
 * Applies a stored arrangement (or `defaults` when nothing is stored) to the tab's live devices
 * (already in server order): entries keep their order and size, widgets always stay, entries for
 * devices not in the tab are dropped, and devices without an entry are appended at 1x1, unless
 * `appendUnplaced` is false (Home shows only what was put there).
 */
export function reconcileLayout(
  entries: readonly LayoutEntry[] | undefined,
  devices: readonly Device[],
  defaults: readonly LayoutEntry[] = [],
  { appendUnplaced = true }: { appendUnplaced?: boolean } = {},
): ArrangedTile[] {
  const byId = new Map(devices.map((d) => [d.id, d]))
  const placed: ArrangedTile[] = []
  for (const entry of entries ?? defaults) {
    if ('widget' in entry) {
      placed.push(widgetTile(entry))
      continue
    }
    const device = byId.get(entry.deviceId)
    if (!device) continue
    placed.push({ key: device.id, device, size: entry.size })
    byId.delete(entry.deviceId)
  }
  if (!appendUnplaced) return placed
  return [...placed, ...[...byId.values()].map((device) => ({ key: device.id, device, size: 'S1x1' as const }))]
}

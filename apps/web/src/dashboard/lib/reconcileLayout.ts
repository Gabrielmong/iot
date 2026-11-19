import type { WidgetKind } from '../widgets/widgetKinds'
import type { Device } from '../types'
import type { TileSize } from './tileSize'

/** One stored card of an arrangement: a device or a widget. */
export type LayoutEntry = { deviceId: string; size: TileSize } | { widget: WidgetKind; size: TileSize }

/** A card to render, keyed like its entry: the live device or a widget, and its size. */
export type ArrangedTile = { key: string; size: TileSize } & ({ device: Device } | { widget: WidgetKind })

/** A widget's key: `widget:WEATHER`. Never clashes with a device id. */
export const widgetKey = (kind: WidgetKind) => `widget:${kind}`

/** The key an entry is moved and resized by: the device id, or `widget:<kind>`. */
export function entryKey(entry: LayoutEntry): string {
  return 'widget' in entry ? widgetKey(entry.widget) : entry.deviceId
}

/**
 * Applies a stored arrangement (or `defaults` when nothing is stored) to the tab's live devices
 * (already in server order): entries keep their order and size, widgets always stay, entries for
 * devices not in the tab are dropped, and devices without an entry are appended at 1×1.
 */
export function reconcileLayout(
  entries: readonly LayoutEntry[] | undefined,
  devices: readonly Device[],
  defaults: readonly LayoutEntry[] = [],
): ArrangedTile[] {
  const byId = new Map(devices.map((d) => [d.id, d]))
  const placed: ArrangedTile[] = []
  for (const entry of entries ?? defaults) {
    if ('widget' in entry) {
      placed.push({ key: widgetKey(entry.widget), widget: entry.widget, size: entry.size })
      continue
    }
    const device = byId.get(entry.deviceId)
    if (!device) continue
    placed.push({ key: device.id, device, size: entry.size })
    byId.delete(entry.deviceId)
  }
  return [...placed, ...[...byId.values()].map((device) => ({ key: device.id, device, size: 'S1x1' as const }))]
}

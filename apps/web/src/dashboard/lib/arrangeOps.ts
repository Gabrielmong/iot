import { WIDGET_START_SIZE, type WidgetKind } from '../widgets/widgetKinds'
import { newWidgetId } from './newWidgetId'
import { type ArrangedTile, entryKey, type LayoutEntry } from './reconcileLayout'
import type { TileSize } from './tileSize'

const indexOf = (list: LayoutEntry[], key: string) => list.findIndex((e) => entryKey(e) === key)

/** Moves the active entry to where `overKey` is (array-move semantics); unknown keys leave the list as is. */
export function moveEntry(list: LayoutEntry[], activeKey: string, overKey: string): LayoutEntry[] {
  const from = indexOf(list, activeKey)
  const to = indexOf(list, overKey)
  if (from < 0 || to < 0 || from === to) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Sets one entry's size. */
export function resizeEntry(list: LayoutEntry[], key: string, size: TileSize): LayoutEntry[] {
  return list.map((e) => (entryKey(e) === key ? { ...e, size } : e))
}

/** The entries an arrangement of tiles stores. */
export function toEntries(tiles: readonly ArrangedTile[]): LayoutEntry[] {
  return tiles.map((t) =>
    'widget' in t
      ? { widget: t.widget, widgetId: t.widgetId, ...(t.targetId !== undefined ? { targetId: t.targetId } : {}), size: t.size }
      : { deviceId: t.device.id, size: t.size },
  )
}

/** Moves an entry one or more places along the list (keyboard arranging); stays put past the ends. */
export function moveEntryBy(list: LayoutEntry[], key: string, delta: number): LayoutEntry[] {
  const from = indexOf(list, key)
  const to = from + delta
  if (from < 0 || to < 0 || to >= list.length) return list
  return moveEntry(list, key, entryKey(list[to]))
}

/** Puts a new widget instance first, at its starting size, with its target when it has one. */
export function addWidget(list: LayoutEntry[], kind: WidgetKind, targetId?: string, newId: () => string = newWidgetId): LayoutEntry[] {
  return [{ widget: kind, widgetId: newId(), ...(targetId !== undefined ? { targetId } : {}), size: WIDGET_START_SIZE[kind] }, ...list]
}

/** Puts a device last at 1x1 (adding it to Home); a device already there stays where it is. */
export function addDevice(list: LayoutEntry[], deviceId: string): LayoutEntry[] {
  if (list.some((e) => 'deviceId' in e && e.deviceId === deviceId)) return list
  return [...list, { deviceId, size: 'S1x1' }]
}

/** Takes one card (device or widget) off the tab. */
export function removeEntry(list: LayoutEntry[], key: string): LayoutEntry[] {
  return list.filter((e) => entryKey(e) !== key)
}

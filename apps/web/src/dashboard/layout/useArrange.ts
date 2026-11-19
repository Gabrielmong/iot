import { useState } from 'react'
import { addDevice, addWidget, moveEntry, moveEntryBy, removeEntry, resizeEntry, toEntries } from '../lib/arrangeOps'
import { type ArrangedTile, type LayoutEntry, reconcileLayout } from '../lib/reconcileLayout'
import type { TileSize } from '../lib/tileSize'
import type { Device } from '../types'
import type { WidgetKind } from '../widgets/widgetKinds'
import { useDashboardLayouts } from './data/useDashboardLayouts'
import { useArrangeDraft } from './useArrangeDraft'

export const SAVE_FAILED = "Couldn't save the layout."
export const RESET_FAILED = "Couldn't reset the layout."

/**
 * Arrange mode for the current tab: the tiles to show (saved layout, or the draft while arranging,
 * both applied to the live devices), and start / cancel / save / reset. Edits apply to what is shown,
 * so devices that appear mid-arrange can be moved too. If the arranged tab disappears (its room is
 * gone), arranging stops quietly. A failed save keeps the draft and reports `SAVE_FAILED`. `defaults`
 * stand in for a tab with no saved layout (e.g. the weather widget on All). `appendUnplaced: false` (Home)
 * shows only the devices placed on the tab.
 */
export function useArrange(
  tab: string,
  devices: readonly Device[],
  onError: (message: string) => void,
  defaults: readonly LayoutEntry[] = [],
  options: { appendUnplaced?: boolean } = {},
) {
  const layouts = useDashboardLayouts()
  const draft = useArrangeDraft()
  const [busy, setBusy] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  // The tab fell back (e.g. to "All") while arranging: drop the draft rather than save it elsewhere.
  if (draft.draft && draft.draft.tab !== tab) draft.stop()
  const editing = draft.draft?.tab === tab ? draft.draft.entries : null

  const saved = layouts.layoutFor(tab)
  const tiles: ArrangedTile[] = reconcileLayout(editing ?? saved?.entries, devices, defaults, options)
  const edit = (change: (shown: LayoutEntry[]) => LayoutEntry[]) => draft.set(change(toEntries(tiles)))

  const save = async (asDefault: boolean) => {
    setBusy(true)
    const ok = await layouts.save(tab, toEntries(tiles), asDefault)
    setBusy(false)
    if (ok) draft.stop()
    else onError(SAVE_FAILED)
  }

  const reset = async () => {
    if (!(await layouts.reset(tab))) throw new Error(RESET_FAILED)
    draft.stop()
  }

  return {
    tiles,
    layoutsLoaded: layouts.loaded,
    layoutsFailed: layouts.failed,
    arranging: editing !== null,
    busy,
    canReset: saved !== undefined && !saved.isDefault,
    start: () => draft.start(tab, toEntries(tiles)),
    cancel: draft.stop,
    save,
    move: (activeKey: string, overKey: string) => edit((l) => moveEntry(l, activeKey, overKey)),
    moveBy: (key: string, delta: number) => edit((l) => moveEntryBy(l, key, delta)),
    resize: (key: string, size: TileSize) => edit((l) => resizeEntry(l, key, size)),
    addWidget: (kind: WidgetKind, targetId?: string) => edit((l) => addWidget(l, kind, targetId)),
    addDevice: (deviceId: string) => edit((l) => addDevice(l, deviceId)),
    removeEntry: (key: string) => edit((l) => removeEntry(l, key)),
    confirmingReset,
    askReset: () => setConfirmingReset(true),
    closeReset: () => setConfirmingReset(false),
    reset,
  }
}

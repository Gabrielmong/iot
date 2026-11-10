import { useState } from 'react'
import { moveEntry, moveEntryBy, resizeEntry, toEntries } from '../lib/arrangeOps'
import { type ArrangedTile, type LayoutEntry, reconcileLayout } from '../lib/reconcileLayout'
import type { TileSize } from '../lib/tileSize'
import type { Device } from '../types'
import { useDashboardLayouts } from './data/useDashboardLayouts'
import { useArrangeDraft } from './useArrangeDraft'

export const SAVE_FAILED = "Couldn't save the layout."
export const RESET_FAILED = "Couldn't reset the layout."

/**
 * Arrange mode for the current tab: the tiles to show (saved layout, or the draft while arranging,
 * both applied to the live devices), and start / cancel / save / reset. Edits apply to what is shown,
 * so devices that appear mid-arrange can be moved too. If the arranged tab disappears (its room is
 * gone), arranging stops quietly. A failed save keeps the draft and reports `SAVE_FAILED`.
 */
export function useArrange(tab: string, devices: readonly Device[], onError: (message: string) => void) {
  const layouts = useDashboardLayouts()
  const draft = useArrangeDraft()
  const [busy, setBusy] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  // The tab fell back (e.g. to "All") while arranging: drop the draft rather than save it elsewhere.
  if (draft.draft && draft.draft.tab !== tab) draft.stop()
  const editing = draft.draft?.tab === tab ? draft.draft.entries : null

  const saved = layouts.layoutFor(tab)
  const tiles: ArrangedTile[] = reconcileLayout(editing ?? saved?.entries, devices)
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
    arranging: editing !== null,
    busy,
    canReset: saved !== undefined && !saved.isDefault,
    start: () => draft.start(tab, toEntries(tiles)),
    cancel: draft.stop,
    save,
    move: (activeId: string, overId: string) => edit((l) => moveEntry(l, activeId, overId)),
    moveBy: (deviceId: string, delta: number) => edit((l) => moveEntryBy(l, deviceId, delta)),
    resize: (deviceId: string, size: TileSize) => edit((l) => resizeEntry(l, deviceId, size)),
    confirmingReset,
    askReset: () => setConfirmingReset(true),
    closeReset: () => setConfirmingReset(false),
    reset,
  }
}

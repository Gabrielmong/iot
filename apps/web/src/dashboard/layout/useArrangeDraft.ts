import { useCallback, useState } from 'react'
import type { LayoutEntry } from '../lib/reconcileLayout'

/** The unsaved arrangement and the tab it belongs to. */
export type Draft = { tab: string; entries: LayoutEntry[] }

/**
 * The unsaved arrangement being edited: ids and sizes only, so live device updates never reset it.
 * `null` when not arranging.
 */
export function useArrangeDraft() {
  const [draft, setDraft] = useState<Draft | null>(null)
  return {
    draft,
    start: useCallback((tab: string, entries: LayoutEntry[]) => setDraft({ tab, entries }), []),
    set: useCallback((entries: LayoutEntry[]) => setDraft((d) => (d ? { ...d, entries } : d)), []),
    stop: useCallback(() => setDraft(null), []),
  }
}

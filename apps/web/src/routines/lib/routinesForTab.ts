import { ALL_TAB } from '../../dashboard/lib/roomTabs'
import type { Routine } from '../types'

/** Routines shown under a dashboard tab: all of them on "All", else those tagged with that room. */
export function routinesForTab(routines: readonly Routine[], tab: string): Routine[] {
  const shown = tab === ALL_TAB ? [...routines] : routines.filter((r) => r.room?.id === tab)
  return shown.sort((a, b) => a.name.localeCompare(b.name))
}

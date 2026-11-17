import { useCallback, useState } from 'react'
import type { TimelineEntry } from './timeline/buildTimeline'
import type { Selection } from './timeline/selection'
import { defaultSelection, findTarget, sameSelection } from './timeline/selectionTargets'

/**
 * Which log is open: the one picked while it still exists, else the default (see `defaultSelection`).
 * With `collapsible` (phones, where the log opens under its line) tapping the open line closes it.
 */
export function useLogSelection(entries: readonly TimelineEntry[], collapsible: boolean) {
  const [picked, setPicked] = useState<Selection | null>(null)
  const [closed, setClosed] = useState(false)

  const current = picked && findTarget(entries, picked) ? picked : defaultSelection(entries)
  const selected = collapsible && closed ? null : current

  const select = useCallback(
    (s: Selection) => {
      if (collapsible && !closed && sameSelection(s, current)) {
        setClosed(true)
        return
      }
      setPicked(s)
      setClosed(false)
    },
    [collapsible, closed, current],
  )

  return { selected, select }
}

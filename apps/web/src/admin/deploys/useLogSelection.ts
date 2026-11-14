import { useCallback, useState } from 'react'
import type { DeployEvent } from '../data/useDeployStatus'

/**
 * Which event's log is open: the one picked, else the running one, else the newest.
 * With `collapsible` (phones, where the log opens under its row) tapping the open row closes it.
 */
export function useLogSelection(events: readonly DeployEvent[], collapsible: boolean) {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [closed, setClosed] = useState(false)

  const current = events.find((e) => e.id === pickedId) ?? events.find((e) => e.status === 'RUNNING') ?? events[0] ?? null
  const selected = collapsible && closed ? null : current

  const select = useCallback(
    (id: string) => {
      if (collapsible && !closed && id === current?.id) {
        setClosed(true)
        return
      }
      setPickedId(id)
      setClosed(false)
    },
    [collapsible, closed, current?.id],
  )

  return { selected, select }
}

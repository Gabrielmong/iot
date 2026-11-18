import { useQuery } from '@apollo/client/react'
import { useMemo } from 'react'
import { POWER_HISTORY } from '../../data/documents'

export type PowerRange = '24h' | '7d'
export const RANGE_MS: Record<PowerRange, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000 }

/**
 * A PC's On/Off changes over the last 24 h / 7 days. `stateOn` is the PC's live state: when it changes,
 * the window moves to now, so the history is fetched again and the new change shows up.
 */
export function usePowerHistory(deviceId: string, range: PowerRange, stateOn: boolean | null, skip: boolean) {
  const { from, to } = useMemo(() => {
    void stateOn // re-anchors the window on every On/Off change
    const end = new Date()
    return { from: new Date(end.getTime() - RANGE_MS[range]), to: end }
  }, [range, stateOn])
  const { data } = useQuery(POWER_HISTORY, { variables: { id: deviceId, since: from.toISOString() }, skip, fetchPolicy: 'cache-and-network' })
  return { events: data?.device?.powerHistory ?? [], from, to }
}

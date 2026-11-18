import { useSubscription } from '@apollo/client/react'
import { useState } from 'react'
import type { PcStatsLiveSubscription } from '../../../gql/graphql'
import { PC_STATS } from './statsDocuments'

export type PcStats = PcStatsLiveSubscription['pcStats']

/** Samples kept for the history charts: 2 minutes at the server's one sample every 2 s. */
export const HISTORY_LENGTH = 60

/** The PC's latest sample and the recent ones, while the page is open (subscribing is what makes the agent sample). */
export function usePcStats(deviceId: string) {
  const [history, setHistory] = useState<readonly PcStats[]>([])
  useSubscription(PC_STATS, {
    variables: { deviceId },
    onData: ({ data }) => {
      const s = data.data?.pcStats
      if (s) setHistory((h) => [...h.slice(-(HISTORY_LENGTH - 1)), s])
    },
  })
  return { latest: history.at(-1) ?? null, history }
}

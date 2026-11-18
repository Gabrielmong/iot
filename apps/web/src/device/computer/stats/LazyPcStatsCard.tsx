import { lazy, Suspense } from 'react'

const PcStatsCard = lazy(() => import('./PcStatsCard').then((m) => ({ default: m.PcStatsCard })))

/** The live stats card, loaded on first use: its charts are only needed on the page of a PC with an agent. */
export function LazyPcStatsCard({ deviceId }: { deviceId: string }) {
  return (
    <Suspense fallback={null}>
      <PcStatsCard deviceId={deviceId} />
    </Suspense>
  )
}

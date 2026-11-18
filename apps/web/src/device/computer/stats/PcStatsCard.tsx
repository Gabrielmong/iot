import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { SectionCard } from '../../common/SectionCard'
import { DiskBars } from './DiskBars'
import { formatBytes, formatDuration, formatRate } from './formatStats'
import { Gauge } from './Gauge'
import { StatsHistory } from './StatsHistory'
import { usePcStats, type PcStats } from './usePcStats'

/** The PC's live numbers, sampled by its agent only while this card is open. */
export function PcStatsCard({ deviceId }: { deviceId: string }) {
  const { latest, history } = usePcStats(deviceId)
  return (
    <SectionCard title="Live stats">
      {latest ? (
        <Stack spacing={2}>
          <Gauges stats={latest} />
          <StatsHistory history={history} />
          <DiskBars disks={latest.disks} />
          <Facts stats={latest} />
        </Stack>
      ) : (
        <Typography color="text.secondary">Waiting for stats…</Typography>
      )}
    </SectionCard>
  )
}

function Gauges({ stats }: { stats: PcStats }) {
  const ram = stats.ramTotal > 0 ? (stats.ramUsed / stats.ramTotal) * 100 : 0
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 1 }}>
      <Gauge label="CPU" value={stats.cpu} />
      <Gauge label="RAM" value={ram} caption={`${formatBytes(stats.ramUsed)} of ${formatBytes(stats.ramTotal)}`} />
      {stats.gpu && <Gauge label="GPU" value={stats.gpu.load} caption={`${stats.gpu.name} · ${Math.round(stats.gpu.tempC)} °C`} />}
    </Box>
  )
}

/** "Gabriel · idle 12 min", or just the name when the idle time is unknown; null when nobody is signed in. */
function whoText(stats: PcStats): string | null {
  if (!stats.user) return null
  return stats.idleS === null || stats.idleS === undefined ? stats.user : `${stats.user} · idle ${formatDuration(stats.idleS)}`
}

function Facts({ stats }: { stats: PcStats }) {
  const who = whoText(stats)
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2">{`↑ ${formatRate(stats.netUp)} ↓ ${formatRate(stats.netDown)}`}</Typography>
      <Typography variant="body2">{`Up ${formatDuration(stats.uptimeS)}`}</Typography>
      {who && <Typography variant="body2">{who}</Typography>}
    </Stack>
  )
}

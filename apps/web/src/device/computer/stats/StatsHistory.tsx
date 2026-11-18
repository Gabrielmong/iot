import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { SparkLineChart } from '@mui/x-charts/SparkLineChart'
import { formatRate } from './formatStats'
import type { PcStats } from './usePcStats'

type Series = { label: string; data: number[]; max?: number; format: (v: number | null) => string }

const percent = (v: number | null) => (v === null ? '' : `${Math.round(v)}%`)
const rate = (v: number | null) => (v === null ? '' : formatRate(v))

function seriesOf(history: readonly PcStats[]): Series[] {
  const hasGpu = Boolean(history.at(-1)?.gpu)
  return [
    { label: 'CPU', data: history.map((s) => s.cpu), max: 100, format: percent },
    ...(hasGpu ? [{ label: 'GPU', data: history.map((s) => s.gpu?.load ?? 0), max: 100, format: percent }] : []),
    { label: 'Download', data: history.map((s) => s.netDown), format: rate },
    { label: 'Upload', data: history.map((s) => s.netUp), format: rate },
  ]
}

/** Small charts of the last couple of minutes: CPU, GPU (when there is one), download and upload. */
export function StatsHistory({ history }: { history: readonly PcStats[] }) {
  if (history.length < 2) return null
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
      {seriesOf(history).map((s) => (
        <Box key={s.label}>
          <Typography variant="caption" color="text.secondary">
            {s.label} · last 2 min
          </Typography>
          <SparkLineChart data={s.data} height={48} area curve="linear" showTooltip yAxis={{ min: 0, max: s.max }} valueFormatter={s.format} />
        </Box>
      ))}
    </Box>
  )
}

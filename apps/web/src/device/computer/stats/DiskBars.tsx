import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { formatBytes } from './formatStats'
import type { PcStats } from './usePcStats'

/** One bar per fixed drive, filled by the space used. */
export function DiskBars({ disks }: { disks: PcStats['disks'] }) {
  return (
    <Stack spacing={1}>
      {disks.map((d) => {
        const used = d.total > 0 ? ((d.total - d.free) / d.total) * 100 : 0
        return (
          <Stack key={d.mount} spacing={0.5}>
            <Typography variant="body2">{`${d.mount} ${formatBytes(d.free)} free of ${formatBytes(d.total)}`}</Typography>
            <LinearProgress variant="determinate" value={used} aria-label={`${d.mount} used`} sx={{ height: 8, borderRadius: 4 }} />
          </Stack>
        )
      })}
    </Stack>
  )
}

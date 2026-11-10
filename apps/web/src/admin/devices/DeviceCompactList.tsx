import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { BRAND_LABELS } from '../lib/deviceLabels'
import { formatLastSeen } from '../lib/formatLastSeen'
import type { AdminDevice } from '../types'
import { HealthChip } from './HealthChip'
import { KindIcon } from './KindIcon'

type Props = { devices: readonly AdminDevice[]; renderAction: (device: AdminDevice) => ReactNode; onClearFilters: () => void }

/** Phone layout: two-line rows (name and status, then room · brand/model · last seen) with no sideways scrolling. */
export function DeviceCompactList({ devices, renderAction, onClearFilters }: Props) {
  if (devices.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="text.secondary">No devices match</Typography>
        <Button onClick={onClearFilters} sx={{ mt: 1 }}>
          Clear filters
        </Button>
      </Box>
    )
  }
  return (
    <Paper variant="outlined" component="ul" aria-label="Your devices" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}>
      {devices.map((d) => (
        <Box
          key={d.id}
          component={motion.li}
          layout="position"
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
        >
          <KindIcon kind={d.kind} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography data-testid="device-name" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
                {d.name}
              </Typography>
              <HealthChip device={d} />
            </Box>
            <Typography variant="body2" color="text.secondary" noWrap>
              {[d.room?.name ?? 'No room', [BRAND_LABELS[d.brand], d.model].filter(Boolean).join(' '), formatLastSeen(d.lastSeenAt)].join(' · ')}
            </Typography>
          </Box>
          {renderAction(d)}
        </Box>
      ))}
    </Paper>
  )
}

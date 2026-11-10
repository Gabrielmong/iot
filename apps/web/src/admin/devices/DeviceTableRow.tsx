import Box from '@mui/material/Box'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { BRAND_LABELS } from '../lib/deviceLabels'
import { formatLastSeen } from '../lib/formatLastSeen'
import type { AdminDevice } from '../types'
import { HealthChip } from './HealthChip'
import { KindIcon } from './KindIcon'

type Props = { device: AdminDevice; action: ReactNode }

const muted = { color: 'text.secondary' } as const

/** One adopted device as a table row; glides to its new place when sorting or filtering changes. */
export function DeviceTableRow({ device, action }: Props) {
  return (
    <TableRow
      component={motion.tr}
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      hover
    >
      <TableCell sx={{ width: 50, pr: 0 }}>
        <KindIcon kind={device.kind} />
      </TableCell>
      <TableCell>
        <Typography data-testid="device-name" sx={{ fontWeight: 600 }}>
          {device.name}
        </Typography>
      </TableCell>
      <TableCell sx={device.room ? undefined : muted}>{device.room?.name ?? 'No room'}</TableCell>
      <TableCell sx={muted}>{[BRAND_LABELS[device.brand], device.model].filter(Boolean).join(' ')}</TableCell>
      <TableCell sx={{ ...muted, fontVariantNumeric: 'tabular-nums' }}>{device.ip ?? '—'}</TableCell>
      <TableCell>
        <HealthChip device={device} />
      </TableCell>
      <TableCell sx={{ ...muted, whiteSpace: 'nowrap' }}>{formatLastSeen(device.lastSeenAt)}</TableCell>
      <TableCell align="right" sx={{ width: 56, py: 0 }}>
        <Box sx={{ display: 'inline-flex' }}>{action}</Box>
      </TableCell>
    </TableRow>
  )
}

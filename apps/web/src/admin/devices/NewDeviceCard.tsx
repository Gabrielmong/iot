import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { BRAND_LABELS } from '../lib/deviceLabels'
import type { AdminDevice } from '../types'
import { KindIcon } from './KindIcon'

type Props = { device: AdminDevice; onAdopt: () => void; test?: ReactNode }

/** A device found on the network but not adopted yet: what it is, where it is, and Adopt. */
export function NewDeviceCard({ device, onAdopt, test }: Props) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, display: 'grid', gap: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255, 181, 71, 0.45)', bgcolor: 'rgba(255, 181, 71, 0.04)' }}
    >
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', minWidth: 0 }}>
        <KindIcon kind={device.kind} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 600 }}>
            {device.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {[BRAND_LABELS[device.brand], device.model, device.ip].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>{test}</Box>
        <Button variant="contained" aria-label={`Adopt ${device.name}`} onClick={onAdopt}>
          Adopt
        </Button>
      </Box>
    </Paper>
  )
}

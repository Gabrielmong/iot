import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { PageSection } from '../common/PageSection'
import type { AdminDevice } from '../types'
import { NewDeviceCard } from './NewDeviceCard'

type Props = { devices: readonly AdminDevice[]; onAdopt: (device: AdminDevice) => void; renderTest?: (device: AdminDevice) => ReactNode }

/** Devices seen on the network but not adopted, as a grid of cards. Hidden when there are none. */
export function NewDevicesStrip({ devices, onAdopt, renderTest }: Props) {
  if (devices.length === 0) return null
  return (
    <PageSection title="New on network">
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' } }}>
        {devices.map((d) => (
          <NewDeviceCard key={d.id} device={d} onAdopt={() => onAdopt(d)} test={renderTest?.(d)} />
        ))}
      </Box>
    </PageSection>
  )
}

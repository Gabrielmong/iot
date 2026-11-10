import { useApolloClient } from '@apollo/client/react'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useState } from 'react'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { SectionCard } from '../common/SectionCard'
import type { DeviceDetail } from '../types'
import { type AdminDialog, DeviceAdminDialogs } from './DeviceAdminDialogs'
import { OnvifLocalSection } from './OnvifLocalSection'
import { StreamSourceNote } from './StreamSourceNote'

/** Admin-only actions for the device, as a list of buttons that each open a dialog. */
export function DeviceAdminSection({ device }: { device: DeviceDetail }) {
  const { user } = useCurrentUser()
  const client = useApolloClient()
  const [dialog, setDialog] = useState<AdminDialog>(null)
  if (user?.role !== 'ADMIN') return null

  const close = () => {
    // Edits come back as AdminDevice, so re-read the Device this page shows. After a remove the page has navigated away.
    if (dialog !== 'remove') void client.refetchQueries({ include: ['Device'] }).catch(() => {})
    setDialog(null)
  }
  const button = (label: string, which: Exclude<AdminDialog, null>) => (
    <Button variant="outlined" size="large" onClick={() => setDialog(which)}>
      {label}
    </Button>
  )
  return (
    <SectionCard title="Admin">
      <StreamSourceNote device={device} />
      <Stack spacing={1}>
        {button('Rename', 'edit')}
        {button('Move room', 'edit')}
        {device.kind !== 'TV' && device.kind !== 'COMPUTER' && button('Change type', 'kind')}
        {device.brand === 'TUYA' && button('Set Tuya local key', 'key')}
        {button('Who has access', 'access')}
        <Button variant="outlined" color="error" size="large" onClick={() => setDialog('remove')}>
          Remove
        </Button>
      </Stack>
      <OnvifLocalSection device={device} />
      <DeviceAdminDialogs dialog={dialog} device={device} onClose={close} />
    </SectionCard>
  )
}

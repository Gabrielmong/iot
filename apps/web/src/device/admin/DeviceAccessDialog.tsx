import { hiddenFromGuests } from '../../common/guestHidden'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { NoticeDialog } from '../../admin/common/NoticeDialog'
import { useUsers } from '../../admin/data/useUsers'
import { useComputerGrants } from '../data/useComputerGrants'
import { useDeviceGrants } from '../data/useDeviceGrants'
import { pcFlagsById } from '../lib/pcGrants'
import type { DeviceDetail } from '../types'
import { AccessForm } from './AccessForm'

type Props = { device: Pick<DeviceDetail, 'id' | 'name' | 'kind'>; onClose: () => void }

/** Loads the users and this device's grants (and a PC's permission flags), then shows the checklist. */
export function DeviceAccessDialog({ device, onClose }: Props) {
  const title = `Who has access to ${device.name}`
  const { users, hasData: haveUsers, error: usersError } = useUsers()
  const { grantedIds, error: grantsError } = useDeviceGrants(device.id)
  const isPc = device.kind === 'COMPUTER'
  const { grants: pcGrants, error: pcError } = useComputerGrants(device.id, !isPc)
  if (usersError || grantsError || pcError) {
    return (
      <NoticeDialog title={title} onClose={onClose}>
        <Typography color="error">Couldn't load access. Close and try again.</Typography>
      </NoticeDialog>
    )
  }
  if (!grantedIds || !haveUsers || !pcGrants) {
    return (
      <NoticeDialog title={title} onClose={onClose}>
        <CircularProgress aria-label="Loading access" />
      </NoticeDialog>
    )
  }
  return (
    <AccessForm
      deviceId={device.id}
      deviceName={device.name}
      guestHidden={hiddenFromGuests(device.kind)}
      users={users}
      grantedIds={grantedIds}
      pcFlags={isPc ? pcFlagsById(pcGrants) : undefined}
      onClose={onClose}
    />
  )
}

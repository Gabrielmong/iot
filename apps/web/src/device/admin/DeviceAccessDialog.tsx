import { hiddenFromGuests } from '../../common/guestHidden'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { NoticeDialog } from '../../admin/common/NoticeDialog'
import { useUsers } from '../../admin/data/useUsers'
import { useDeviceGrants } from '../data/useDeviceGrants'
import type { DeviceDetail } from '../types'
import { AccessForm } from './AccessForm'

type Props = { device: Pick<DeviceDetail, 'id' | 'name' | 'kind'>; onClose: () => void }

/** Loads the users and this device's grants, then shows the checklist. */
export function DeviceAccessDialog({ device, onClose }: Props) {
  const title = `Who has access to ${device.name}`
  const { users, hasData: haveUsers, error: usersError } = useUsers()
  const { grantedIds, error: grantsError } = useDeviceGrants(device.id)
  if (usersError || grantsError) {
    return (
      <NoticeDialog title={title} onClose={onClose}>
        <Typography color="error">Couldn't load access. Close and try again.</Typography>
      </NoticeDialog>
    )
  }
  if (!grantedIds || !haveUsers) {
    return (
      <NoticeDialog title={title} onClose={onClose}>
        <CircularProgress aria-label="Loading access" />
      </NoticeDialog>
    )
  }
  return <AccessForm deviceId={device.id} deviceName={device.name} guestHidden={hiddenFromGuests(device.kind)} users={users} grantedIds={grantedIds} onClose={onClose} />
}

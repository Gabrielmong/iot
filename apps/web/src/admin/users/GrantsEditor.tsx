import { hiddenFromGuests } from '../../common/guestHidden'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { useRooms } from '../../dashboard/data/useRooms'
import { NoticeDialog } from '../common/NoticeDialog'
import { useAdminDevices } from '../data/useAdminDevices'
import { useGrants } from '../data/useGrants'
import { grantableDevices } from '../lib/grantableDevices'
import { groupDevicesByRoom } from '../lib/groupDevicesByRoom'
import type { AdminUser } from '../types'
import { GrantsForm } from './GrantsForm'

/** Per-user device access: admins see a note, everyone else a checklist grouped by room. */
export function GrantsEditor({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const title = `Device access for ${user.name}`
  const isAdmin = user.role === 'ADMIN'
  const { devices, loading: devicesLoading } = useAdminDevices()
  const rooms = useRooms()
  const { grantedIds, loading: grantsLoading, error } = useGrants(user.id, isAdmin)

  if (isAdmin) {
    return (
      <NoticeDialog title={title} onClose={onClose}>
        <Typography>Admins can operate every device, so there is nothing to choose.</Typography>
      </NoticeDialog>
    )
  }
  if (error) {
    return (
      <NoticeDialog title={title} onClose={onClose}>
        <Typography color="error">Couldn't load this user's access. Close and try again.</Typography>
      </NoticeDialog>
    )
  }
  if (!grantedIds || grantsLoading || (devicesLoading && devices.length === 0)) {
    return (
      <NoticeDialog title={title} onClose={onClose}>
        <CircularProgress aria-label="Loading access" />
      </NoticeDialog>
    )
  }
  const groups = groupDevicesByRoom(grantableDevices(devices).filter((d) => user.role !== 'GUEST' || !hiddenFromGuests(d.kind)), rooms)
  return <GrantsForm user={user} grantedIds={grantedIds} groups={groups} onClose={onClose} />
}

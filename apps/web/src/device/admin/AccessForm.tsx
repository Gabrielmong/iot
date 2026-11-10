import { useState } from 'react'
import { FormDialog } from '../../admin/common/FormDialog'
import { toggleId } from '../../admin/lib/grantSelection'
import type { AdminUser } from '../../admin/types'
import { useSetDeviceGrants } from '../data/useDeviceGrants'
import { initialUserSelection } from '../lib/accessSelection'
import { AccessChecklist } from './AccessChecklist'

type Props = { deviceId: string; deviceName: string; guestHidden: boolean; users: readonly AdminUser[]; grantedIds: readonly string[]; onClose: () => void }

/** The checklist dialog. Save sends exactly the checked user ids. */
export function AccessForm({ deviceId, deviceName, guestHidden, users, grantedIds, onClose }: Props) {
  const save = useSetDeviceGrants()
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => initialUserSelection(grantedIds, users))
  return (
    <FormDialog title={`Who has access to ${deviceName}`} submitLabel="Save" onSubmit={() => save(deviceId, [...selected])} onClose={onClose}>
      <AccessChecklist users={users} selected={selected} guestHidden={guestHidden} onToggle={(id) => setSelected((s) => toggleId(s, id))} />
    </FormDialog>
  )
}

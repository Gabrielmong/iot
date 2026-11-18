import { useState } from 'react'
import { FormDialog } from '../../admin/common/FormDialog'
import { toggleId } from '../../admin/lib/grantSelection'
import type { AdminUser } from '../../admin/types'
import { useSetComputerGrants } from '../data/useComputerGrants'
import { useSetDeviceGrants } from '../data/useDeviceGrants'
import { initialUserSelection } from '../lib/accessSelection'
import { NO_PC_FLAGS, pcGrantsFor, type PcFlags } from '../lib/pcGrants'
import { AccessChecklist } from './AccessChecklist'
import { PcPermissionChecks } from './PcPermissionChecks'

type Props = {
  deviceId: string
  deviceName: string
  guestHidden: boolean
  users: readonly AdminUser[]
  grantedIds: readonly string[]
  /** A PC's Live stats / Power actions flags per user; undefined for other kinds. */
  pcFlags?: ReadonlyMap<string, PcFlags>
  onClose: () => void
}

/** The checklist dialog. Save sends exactly the checked user ids, then (for a PC) their Live stats / Power flags. */
export function AccessForm({ deviceId, deviceName, guestHidden, users, grantedIds, pcFlags, onClose }: Props) {
  const save = useSetDeviceGrants()
  const savePc = useSetComputerGrants()
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => initialUserSelection(grantedIds, users))
  const [flags, setFlags] = useState<ReadonlyMap<string, PcFlags>>(() => pcFlags ?? new Map())
  const submit = async () => {
    const userIds = [...selected]
    await save(deviceId, userIds)
    if (pcFlags) await savePc(deviceId, pcGrantsFor(userIds, flags))
  }
  return (
    <FormDialog title={`Who has access to ${deviceName}`} submitLabel="Save" onSubmit={submit} onClose={onClose}>
      <AccessChecklist
        users={users}
        selected={selected}
        guestHidden={guestHidden}
        onToggle={(id) => setSelected((s) => toggleId(s, id))}
        renderGranted={
          pcFlags &&
          ((u) => (
            <PcPermissionChecks
              userName={u.name}
              flags={flags.get(u.id) ?? NO_PC_FLAGS}
              onChange={(f) => setFlags((m) => new Map(m).set(u.id, f))}
            />
          ))
        }
      />
    </FormDialog>
  )
}

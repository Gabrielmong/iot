import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { FormDialog } from '../common/FormDialog'
import { useSetGrants } from '../data/useGrants'
import { initialSelection, setIds, toggleId } from '../lib/grantSelection'
import type { RoomGroup } from '../lib/groupDevicesByRoom'
import type { AdminDevice, AdminUser } from '../types'
import { GrantRoomGroup } from './GrantRoomGroup'

type Props = { user: AdminUser; grantedIds: readonly string[]; groups: RoomGroup<AdminDevice>[]; onClose: () => void }

/** The checklist itself. Save sends exactly the checked ids. */
export function GrantsForm({ user, grantedIds, groups, onClose }: Props) {
  const save = useSetGrants()
  // Start from the grants that are visible here; grants on hidden strips or unlisted devices are revoked on save.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => initialSelection(grantedIds, groups))
  return (
    <FormDialog title={`Device access for ${user.name}`} submitLabel="Save" onSubmit={() => save(user.id, [...selected])} onClose={onClose}>
      <Typography variant="body2" color="text.secondary">
        Power strips are shown as their individual outlets; grant access per outlet. Access to anything not listed here is removed on save.
      </Typography>
      {groups.length === 0 && <Typography color="text.secondary">No adopted devices yet.</Typography>}
      {groups.map((group) => (
        <GrantRoomGroup
          key={group.roomId ?? 'none'}
          group={group}
          selected={selected}
          onToggleRoom={(ids, checked) => setSelected((s) => setIds(s, ids, checked))}
          onToggleDevice={(id) => setSelected((s) => toggleId(s, id))}
        />
      ))}
    </FormDialog>
  )
}

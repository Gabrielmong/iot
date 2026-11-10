import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { ConfirmDialog } from '../../admin/common/ConfirmDialog'
import { SelectField } from '../../common/SelectField'
import { AudienceChecklist } from '../../routines/editor/AudienceChecklist'
import { useDeleteCameraGroup } from '../data/useDeleteCameraGroup'
import { useSaveCameraGroup } from '../data/useSaveCameraGroup'
import { LAYOUTS } from '../lib/gridLayout'
import { groupErrors, groupInput, type GroupDraft } from '../lib/groupInput'
import type { CameraGroup } from '../types'
import { GroupCameraOrder } from './GroupCameraOrder'
import { GroupFormDialog } from './GroupFormDialog'

type Props = {
  group: CameraGroup
  cameraNames: ReadonlyMap<string, string>
  isAdmin: boolean
  onSaved: (id: string) => void
  onClose: () => void
  onDeleted: () => void
}

const LAYOUT_OPTIONS = LAYOUTS.map((n) => ({ value: String(n), label: n === 1 ? '1 camera' : `${n} cameras` }))

/** Rename, reorder or remove cameras, pick the preferred layout, share (admins), or delete a group. */
export function GroupSettingsDialog({ group, cameraNames, isAdmin, onSaved, onClose, onDeleted }: Props) {
  const [draft, setDraft] = useState<GroupDraft>({ name: group.name, scope: group.scope, layout: group.layout, cameraIds: [...group.cameraIds], audience: [...group.audience] })
  const [confirming, setConfirming] = useState(false)
  const { save, saving } = useSaveCameraGroup()
  const remove = useDeleteCameraGroup()
  const set = (patch: Partial<GroupDraft>) => setDraft((d) => ({ ...d, ...patch }))

  if (confirming) {
    return (
      <ConfirmDialog
        title={`Delete ${group.name}?`}
        confirmLabel="Delete"
        onConfirm={() => remove(group.id).then(onDeleted)}
        onClose={() => setConfirming(false)}
      >
        {group.scope === 'SHARED' ? 'It disappears for everyone it was shared with.' : 'The cameras stay; only the group goes.'}
      </ConfirmDialog>
    )
  }

  return (
    <GroupFormDialog
      title="Group settings"
      errors={groupErrors(draft)}
      saving={saving}
      onSave={() => save(group.id, groupInput(draft)).then(onSaved)}
      onClose={onClose}
      extraActions={
        <Button color="error" onClick={() => setConfirming(true)}>
          Delete group
        </Button>
      }
    >
      <TextField label="Name" value={draft.name} onChange={(e) => set({ name: e.target.value })} slotProps={{ htmlInput: { maxLength: 40 } }} />
      <SelectField label="Layout" value={String(draft.layout)} options={LAYOUT_OPTIONS} onChange={(v) => set({ layout: Number(v) })} />
      <GroupCameraOrder cameraIds={draft.cameraIds} names={cameraNames} onChange={(cameraIds) => set({ cameraIds })} />
      {isAdmin && draft.scope === 'SHARED' && <AudienceChecklist includeGuests={false} selected={draft.audience} onChange={(audience) => set({ audience })} />}
    </GroupFormDialog>
  )
}

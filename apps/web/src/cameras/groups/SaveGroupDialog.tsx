import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { AudienceChecklist } from '../../routines/editor/AudienceChecklist'
import { useSaveCameraGroup } from '../data/useSaveCameraGroup'
import { groupErrors, groupInput, type GroupDraft } from '../lib/groupInput'
import type { Selection } from '../lib/selection'
import { GroupFormDialog } from './GroupFormDialog'

type Props = { selection: Selection; isAdmin: boolean; onSaved: (id: string) => void; onClose: () => void }

/** Saves the cameras and layout in view as a new group; admins can make it shared. */
export function SaveGroupDialog({ selection, isAdmin, onSaved, onClose }: Props) {
  const [draft, setDraft] = useState<GroupDraft>({ name: '', scope: 'PERSONAL', layout: selection.layout, cameraIds: selection.cameraIds, audience: [] })
  const { save, saving } = useSaveCameraGroup()
  return (
    <GroupFormDialog
      title="Save as group"
      errors={draft.name.trim() ? groupErrors(draft) : []}
      saving={saving || !draft.name.trim()}
      onSave={() => save(null, groupInput(draft)).then(onSaved)}
      onClose={onClose}
    >
      <TextField label="Name" autoFocus value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} slotProps={{ htmlInput: { maxLength: 40 } }} />
      {isAdmin && (
        <FormControlLabel
          label="Shared group"
          control={<Checkbox checked={draft.scope === 'SHARED'} onChange={(e) => setDraft((d) => ({ ...d, scope: e.target.checked ? 'SHARED' : 'PERSONAL' }))} />}
        />
      )}
      {isAdmin && draft.scope === 'SHARED' && <AudienceChecklist includeGuests={false} selected={draft.audience} onChange={(audience) => setDraft((d) => ({ ...d, audience }))} />}
    </GroupFormDialog>
  )
}

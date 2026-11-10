import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useState } from 'react'
import { routineErrorMessage } from '../../routines/lib/routineErrorMessage'
import { useSaveCameraGroup } from '../data/useSaveCameraGroup'
import { groupInput } from '../lib/groupInput'
import { differsFromGroup, type Selection } from '../lib/selection'
import type { CameraGroup } from '../types'
import { GroupSettingsDialog } from './GroupSettingsDialog'
import { SaveGroupDialog } from './SaveGroupDialog'

type Props = {
  selection: Selection
  /** The highlighted group, if any. */
  group: CameraGroup | null
  isAdmin: boolean
  cameraNames: ReadonlyMap<string, string>
  onSaved: (groupId: string) => void
  onDeleted: () => void
  onError: (message: string) => void
}

/** Save as group, Update group (when the view changed), and Group settings for groups the viewer can edit. */
export function GroupActions({ selection, group, isAdmin, cameraNames, onSaved, onDeleted, onError }: Props) {
  const [dialog, setDialog] = useState<'save' | 'settings' | null>(null)
  const { save, saving } = useSaveCameraGroup()
  const editable = group?.editable === true
  const changed = editable && differsFromGroup(selection, group)

  const update = () => {
    if (!group) return
    const draft = { name: group.name, scope: group.scope, layout: selection.layout, cameraIds: selection.cameraIds, audience: [...group.audience] }
    save(group.id, groupInput(draft)).then(onSaved, (e: unknown) => onError(routineErrorMessage(e)))
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
      {selection.cameraIds.length > 0 && (
        <Button size="small" variant="outlined" onClick={() => setDialog('save')}>
          Save as group
        </Button>
      )}
      {changed && (
        <Button size="small" variant="contained" onClick={update} disabled={saving}>
          Update group
        </Button>
      )}
      {editable && (
        <Button size="small" onClick={() => setDialog('settings')}>
          Group settings
        </Button>
      )}
      {dialog === 'save' && <SaveGroupDialog selection={selection} isAdmin={isAdmin} onSaved={onSaved} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && group && (
        <GroupSettingsDialog
          group={group}
          cameraNames={cameraNames}
          isAdmin={isAdmin}
          onSaved={onSaved}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null)
            onDeleted()
          }}
        />
      )}
    </Box>
  )
}

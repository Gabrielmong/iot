import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { FormDialog } from '../common/FormDialog'

type Props = { title: string; submitLabel: string; initialName: string; onSave: (name: string) => Promise<unknown>; onClose: () => void }

/** Name entry shared by "Add room" and "Rename room". */
export function RoomNameDialog({ title, submitLabel, initialName, onSave, onClose }: Props) {
  const [name, setName] = useState(initialName)
  return (
    <FormDialog title={title} submitLabel={submitLabel} canSubmit={name.trim() !== ''} onSubmit={() => onSave(name.trim())} onClose={onClose}>
      <TextField label="Room name" value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
    </FormDialog>
  )
}

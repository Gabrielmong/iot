import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import { useId, useState, type ReactNode } from 'react'
import { routineErrorMessage } from '../../routines/lib/routineErrorMessage'

type Props = {
  title: string
  errors: readonly string[]
  saving: boolean
  onSave: () => Promise<unknown>
  onClose: () => void
  /** Extra actions on the left (e.g. Delete). */
  extraActions?: ReactNode
  children: ReactNode
}

/** The shell of the group dialogs: fields, the reasons Save is disabled, the server's error, Cancel/Save. */
export function GroupFormDialog({ title, errors, saving, onSave, onClose, extraActions, children }: Props) {
  const titleId = useId()
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    setError(null)
    onSave().then(onClose, (e: unknown) => setError(routineErrorMessage(e)))
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {children}
          {errors.length > 0 && <Alert severity="info">{errors.join('. ')}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {extraActions}
        <Button onClick={onClose} sx={{ ml: 'auto' }}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={errors.length > 0 || saving}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

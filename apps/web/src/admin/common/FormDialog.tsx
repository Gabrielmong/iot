import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import { type FormEvent, type ReactNode, useId } from 'react'
import { useSubmit } from './useSubmit'

type Props = {
  title: string
  submitLabel: string
  /** Performs the action; the dialog closes when it resolves and shows the error text if it rejects. */
  onSubmit: () => Promise<unknown>
  onClose: () => void
  canSubmit?: boolean
  destructive?: boolean
  children?: ReactNode
}

/** A modal with Cancel / submit buttons, a busy state and inline error text. */
export function FormDialog({ title, submitLabel, onSubmit, onClose, canSubmit = true, destructive = false, children }: Props) {
  const titleId = useId()
  const { submit, pending, error } = useSubmit(onSubmit, onClose)
  return (
    <Dialog
      open
      onClose={pending ? undefined : onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          component: 'form',
          onSubmit: (e: FormEvent) => {
            e.preventDefault()
            if (canSubmit && !pending) void submit()
          },
        },
      }}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {children}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button size="large" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button
          size="large"
          variant="contained"
          color={destructive ? 'error' : 'primary'}
          type="submit"
          disabled={!canSubmit || pending}
        >
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

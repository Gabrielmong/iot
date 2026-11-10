import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { FormDialog } from './FormDialog'

type Props = {
  title: string
  confirmLabel: string
  onConfirm: () => Promise<unknown>
  onClose: () => void
  children: ReactNode
}

/** A destructive-action confirmation: explanatory text, then a red confirm button. */
export function ConfirmDialog({ title, confirmLabel, onConfirm, onClose, children }: Props) {
  return (
    <FormDialog title={title} submitLabel={confirmLabel} onSubmit={onConfirm} onClose={onClose} destructive>
      <Typography component="div">{children}</Typography>
    </FormDialog>
  )
}

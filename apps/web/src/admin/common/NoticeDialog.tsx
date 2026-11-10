import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { type ReactNode, useId } from 'react'

type Props = { title: string; onClose: () => void; children: ReactNode }

/** A read-only modal with a single Done button. */
export function NoticeDialog({ title, onClose, children }: Props) {
  const titleId = useId()
  return (
    <Dialog open onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>{children}</DialogContent>
      <DialogActions>
        <Button size="large" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { motion } from 'framer-motion'

type Props = {
  arranging: boolean
  isAdmin: boolean
  canReset: boolean
  busy: boolean
  onStart: () => void
  onCancel: () => void
  onSave: (asDefault: boolean) => void
  onReset: () => void
  /** The idle button's label ("Arrange" unless given). */
  startLabel?: string
}

const swap = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.18 } }

/** "Arrange" (or `startLabel`) when idle; while arranging, Cancel, Reset to default and the save button(s). */
export function ArrangeBar({ arranging, isAdmin, canReset, busy, onStart, onCancel, onSave, onReset, startLabel = 'Arrange' }: Props) {
  return (
    <>
      {arranging ? (
        <Box key="editing" component={motion.div} {...swap} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end' }}>
          <Button color="inherit" onClick={onCancel} disabled={busy} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          {canReset && (
            <Button variant="outlined" onClick={onReset} disabled={busy}>
              Reset to default
            </Button>
          )}
          {isAdmin ? (
            <>
              <Button variant="outlined" onClick={() => onSave(false)} disabled={busy}>
                Save for me
              </Button>
              <Button variant="contained" onClick={() => onSave(true)} disabled={busy}>
                Save as default for everyone
              </Button>
            </>
          ) : (
            <Button variant="contained" onClick={() => onSave(false)} disabled={busy}>
              Done
            </Button>
          )}
        </Box>
      ) : (
        <Box key="idle" component={motion.div} {...swap}>
          <Button variant="outlined" onClick={onStart}>
            {startLabel}
          </Button>
        </Box>
      )}
    </>
  )
}

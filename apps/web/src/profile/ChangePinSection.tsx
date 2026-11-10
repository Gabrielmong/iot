import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { type KeyboardEvent, useState } from 'react'
import { PinField } from '../admin/common/PinField'
import { isValidPin } from '../admin/lib/pin'
import { useChangeMyPin } from './data/useChangeMyPin'

/** Current / new / confirm PIN with its own Save, independent of the profile form. */
export function ChangePinSection() {
  const { change, error, loading, clearError } = useChangeMyPin()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)

  const canSave = isValidPin(current) && isValidPin(next) && next === confirm && !loading
  const save = async () => {
    setDone(false)
    if (await change(current, next)) {
      setCurrent('')
      setNext('')
      setConfirm('')
      setDone(true)
    }
  }
  const edit = (set: (v: string) => void) => (v: string) => {
    setDone(false)
    clearError()
    set(v)
  }

  // The dialog is a <form>; Enter here runs Change PIN and must never submit the profile.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    e.stopPropagation()
    if (canSave) void save()
  }

  return (
    <Stack spacing={2} onKeyDown={onKeyDown}>
      <Typography variant="subtitle2">Change PIN</Typography>
      <PinField label="Current PIN" value={current} onChange={edit(setCurrent)} />
      <PinField label="New PIN" value={next} onChange={edit(setNext)} />
      <PinField
        label="Confirm new PIN"
        value={confirm}
        onChange={edit(setConfirm)}
        helperText={confirm !== '' && confirm !== next ? 'PINs do not match' : undefined}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {done && <Alert severity="success">PIN changed</Alert>}
      <Button variant="outlined" disabled={!canSave} onClick={() => void save()}>Change PIN</Button>
    </Stack>
  )
}

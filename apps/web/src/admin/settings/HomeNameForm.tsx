import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useCallback, useState } from 'react'
import { useSetHomeName } from '../../home/data/useSetHomeName'
import { useSubmit } from '../common/useSubmit'

const MAX = 40

type Props = { current: string }

/** Renames the home: shown on the sign-in screen, the side menu and the browser tab. */
export function HomeNameForm({ current }: Props) {
  const [name, setName] = useState(current)
  const [saved, setSaved] = useState(false)
  const setHomeName = useSetHomeName()
  const trimmed = name.trim()
  const run = useCallback(() => setHomeName(trimmed), [setHomeName, trimmed])
  const { submit, pending, error } = useSubmit(run, () => setSaved(true))
  const unchanged = trimmed === current
  const invalid = trimmed.length === 0 || trimmed.length > MAX

  return (
    <Stack
      component="form"
      spacing={2}
      sx={{ maxWidth: 420 }}
      onSubmit={(e) => {
        e.preventDefault()
        if (!invalid && !unchanged) void submit()
      }}
    >
      <TextField
        label="Home name"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setSaved(false)
        }}
        helperText={`Shown on the sign-in screen and in the menu. ${trimmed.length}/${MAX}`}
        error={trimmed.length > MAX}
        slotProps={{ htmlInput: { maxLength: MAX + 10 } }}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {saved && unchanged && <Alert severity="success">Saved</Alert>}
      <Button type="submit" variant="contained" size="large" disabled={pending || invalid || unchanged} sx={{ alignSelf: 'flex-start' }}>
        Save
      </Button>
    </Stack>
  )
}

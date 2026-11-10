import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useState } from 'react'
import { SecretField } from '../common/SecretField'
import { useSubmit } from '../common/useSubmit'
import { useSetKasaCredentials } from '../data/useSetKasaCredentials'
import { KASA_LOGIN_NOTE } from '../lib/kasaNote'
import { SaveOutcome } from './SaveOutcome'

/** TP-Link account for Kasa devices. The password is write-only: empty on load and cleared after saving. */
export function KasaCredentialsForm() {
  const save = useSetKasaCredentials()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saved, setSaved] = useState(false)
  const run = useCallback(() => save(username.trim(), password), [save, username, password])
  const done = useCallback(() => {
    setPassword('')
    setSaved(true)
  }, [])
  const { submit, pending, error } = useSubmit(run, done)

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">{KASA_LOGIN_NOTE}</Typography>
      <TextField label="TP-Link email" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" fullWidth />
      <SecretField label="TP-Link password" value={password} onChange={(e) => { setPassword(e.target.value); setSaved(false) }} />
      <SaveOutcome error={error} saved={saved} />
      <Button variant="contained" size="large" disabled={pending || username.trim() === '' || password === ''} onClick={() => void submit()}>
        Save TP-Link credentials
      </Button>
    </Stack>
  )
}

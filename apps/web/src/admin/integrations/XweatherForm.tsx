import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useState } from 'react'
import { SecretField } from '../common/SecretField'
import { useSubmit } from '../common/useSubmit'
import { useSetXweatherCredentials } from '../data/useWeatherIntegrations'
import { SaveOutcome } from './SaveOutcome'
import { XweatherTest } from './XweatherTest'

/** Xweather client ID and secret. The secret is write-only: empty on load and cleared after saving. */
export function XweatherForm({ configured }: { configured: boolean }) {
  const save = useSetXweatherCredentials()
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')
  const [saved, setSaved] = useState(false)
  const run = useCallback(() => save(clientId.trim(), secret), [save, clientId, secret])
  const done = useCallback(() => {
    setSecret('')
    setSaved(true)
  }, [])
  const { submit, pending, error } = useSubmit(run, done)

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        From your Xweather account's apps page. The weather is fetched for the home's pin, set under Settings.
      </Typography>
      <TextField label="Client ID" value={clientId} onChange={(e) => { setClientId(e.target.value); setSaved(false) }} autoComplete="off" fullWidth />
      <SecretField label="Client secret" value={secret} onChange={(e) => { setSecret(e.target.value); setSaved(false) }} />
      <SaveOutcome error={error} saved={saved} />
      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
        <Button variant="contained" size="large" disabled={pending || clientId.trim() === '' || secret === ''} onClick={() => void submit()}>
          Save Xweather credentials
        </Button>
      </Stack>
      {configured && <XweatherTest />}
    </Stack>
  )
}

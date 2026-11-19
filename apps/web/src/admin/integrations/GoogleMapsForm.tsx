import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useState } from 'react'
import { SecretField } from '../common/SecretField'
import { useSubmit } from '../common/useSubmit'
import { useSetGoogleMapsKey } from '../data/useWeatherIntegrations'
import { SaveOutcome } from './SaveOutcome'

export const MAPS_KEY_NOTE = "Restrict this key to the Maps JavaScript and Places APIs and to this app's address."

/** The Google Maps key for the location map. Write-only here: empty on load and cleared after saving. */
export function GoogleMapsForm() {
  const save = useSetGoogleMapsKey()
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)
  const run = useCallback(() => save(key.trim()), [save, key])
  const done = useCallback(() => {
    setKey('')
    setSaved(true)
  }, [])
  const { submit, pending, error } = useSubmit(run, done)

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">{MAPS_KEY_NOTE}</Typography>
      <SecretField label="Maps API key" value={key} onChange={(e) => { setKey(e.target.value); setSaved(false) }} />
      <SaveOutcome error={error} saved={saved} />
      <Button variant="contained" size="large" disabled={pending || key.trim() === ''} onClick={() => void submit()}>
        Save Google Maps key
      </Button>
    </Stack>
  )
}

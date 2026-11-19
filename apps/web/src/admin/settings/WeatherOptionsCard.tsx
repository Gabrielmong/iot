import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useState } from 'react'
import { useSubmit } from '../common/useSubmit'
import { useUpdateWeatherSettings } from '../data/useWeatherSettings'
import { formatLastSeen } from '../lib/formatLastSeen'
import { optionsError, toInput, type WeatherSettingsFields } from '../lib/weatherOptions'

type Props = { settings: WeatherSettingsFields; updatedAt: string | null }

/** How often the weather is fetched, when it counts as too old, and whether it's fetched at all. */
export function WeatherOptionsCard({ settings, updatedAt }: Props) {
  const save = useUpdateWeatherSettings()
  const [refresh, setRefresh] = useState(String(settings.refreshMinutes))
  const [stale, setStale] = useState(String(settings.staleMinutes))
  const [enabled, setEnabled] = useState(settings.enabled)
  const [saved, setSaved] = useState(false)
  const refreshMinutes = Number(refresh)
  const staleMinutes = Number(stale)
  const invalid = optionsError(refreshMinutes, staleMinutes)
  const changed = refreshMinutes !== settings.refreshMinutes || staleMinutes !== settings.staleMinutes || enabled !== settings.enabled
  const edit = (apply: () => void) => {
    apply()
    setSaved(false)
  }

  const run = useCallback(() => save(toInput(settings, { refreshMinutes, staleMinutes, enabled })), [save, settings, refreshMinutes, staleMinutes, enabled])
  const { submit, pending, error } = useSubmit(run, () => setSaved(true))

  return (
    <Stack spacing={2} sx={{ maxWidth: 420 }}>
      <Typography variant="body2" color="text.secondary">
        {updatedAt ? `Updated ${formatLastSeen(updatedAt).replace('Just now', 'just now')}` : 'Not fetched yet'}
      </Typography>
      {settings.lastError && <Alert severity="warning">{settings.lastError}</Alert>}
      <FormControlLabel control={<Switch checked={enabled} onChange={(e) => edit(() => setEnabled(e.target.checked))} />} label="Fetch the weather" />
      <TextField label="Refresh every (minutes)" type="number" value={refresh} onChange={(e) => edit(() => setRefresh(e.target.value))} error={!!invalid.refresh} helperText={invalid.refresh} />
      <TextField label="Stale after (minutes)" type="number" value={stale} onChange={(e) => edit(() => setStale(e.target.value))} error={!!invalid.stale} helperText={invalid.stale ?? 'Older weather is shown greyed out and routines ignore it.'} />
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">Saved</Alert>}
      <Button variant="contained" size="large" disabled={pending || !changed || !!invalid.refresh || !!invalid.stale} onClick={() => void submit()} sx={{ alignSelf: 'flex-start' }}>
        Save weather options
      </Button>
    </Stack>
  )
}

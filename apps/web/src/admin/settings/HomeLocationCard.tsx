import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { useSubmit } from '../common/useSubmit'
import { useMapsApiKey, useUpdateWeatherSettings } from '../data/useWeatherSettings'
import { parseLatLng, toInput, type LatLng, type WeatherSettingsFields } from '../lib/weatherOptions'
import { CoordinateFields } from './CoordinateFields'
import { LocationMap } from './LocationMap'

const text = (n: number | null) => (n === null ? '' : String(n))

/** Where the home is, for its weather and sun times: a pin on a Google map, or coordinates typed in. */
export function HomeLocationCard({ settings }: { settings: WeatherSettingsFields }) {
  const apiKey = useMapsApiKey()
  const save = useUpdateWeatherSettings()
  const [lat, setLat] = useState(text(settings.lat))
  const [lng, setLng] = useState(text(settings.lng))
  const [address, setAddress] = useState(settings.address)
  const [saved, setSaved] = useState(false)
  const parsed = parseLatLng(lat, lng)
  const pin = typeof parsed === 'string' ? null : parsed
  const changed = lat !== text(settings.lat) || lng !== text(settings.lng) || address !== settings.address

  const place = useCallback((at: LatLng, found?: string) => {
    setLat(String(at.lat))
    setLng(String(at.lng))
    setAddress(found ?? null)
    setSaved(false)
  }, [])
  const type = useCallback((la: string, ln: string) => {
    setLat(la)
    setLng(ln)
    setAddress(null)
    setSaved(false)
  }, [])
  const run = useCallback(() => save(toInput(settings, { ...pin, address })), [save, settings, pin, address])
  const { submit, pending, error } = useSubmit(run, () => setSaved(true))
  const typingError = typeof parsed === 'string' && (lat !== '' || lng !== '') ? parsed : null

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Used for the weather and for sunrise and sunset. Only admins see it.
      </Typography>
      {apiKey === undefined && <CircularProgress size={24} aria-label="Loading the map" />}
      {apiKey === null && (
        <Typography variant="body2">
          <Link component={RouterLink} to="/admin/integrations/google-maps">
            Add a Google Maps key in Integrations
          </Link>{' '}
          to place the pin on a map, or type the coordinates.
        </Typography>
      )}
      {apiKey && <LocationMap apiKey={apiKey} value={pin} onChange={place} />}
      {address && <Typography variant="body2">{address}</Typography>}
      <CoordinateFields lat={lat} lng={lng} error={typingError} onChange={type} />
      {typingError && <Typography variant="body2" color="error">{typingError}</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">Saved</Alert>}
      <Button variant="contained" size="large" disabled={pending || !pin || !changed} onClick={() => void submit()} sx={{ alignSelf: 'flex-start' }}>
        Save location
      </Button>
    </Stack>
  )
}

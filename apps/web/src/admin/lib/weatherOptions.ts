/** The household pin and weather options as the admin settings show them. */
export type WeatherSettingsFields = {
  lat: number | null
  lng: number | null
  address: string | null
  refreshMinutes: number
  staleMinutes: number
  enabled: boolean
  lastError: string | null
}

export type LatLng = { lat: number; lng: number }

/** The input that saves `s` with `changes` applied (the server takes the whole row). */
export function toInput(s: WeatherSettingsFields, changes: Partial<Omit<WeatherSettingsFields, 'lastError'>> = {}) {
  const { lat, lng, address, refreshMinutes, staleMinutes, enabled } = { ...s, ...changes }
  return { lat, lng, address, refreshMinutes, staleMinutes, enabled }
}

const parse = (text: string) => (text.trim() === '' ? NaN : Number(text))

/** The coordinates typed in, or the reason they can't be saved. */
export function parseLatLng(lat: string, lng: string): LatLng | string {
  const la = parse(lat)
  const ln = parse(lng)
  if (Number.isNaN(la) || Number.isNaN(ln)) return 'Enter a latitude and a longitude'
  if (la < -90 || la > 90) return 'Latitude must be from -90 to 90'
  if (ln < -180 || ln > 180) return 'Longitude must be from -180 to 180'
  return { lat: la, lng: ln }
}

/** Same rules and wording as the server. */
export function optionsError(refresh: number, stale: number): { refresh?: string; stale?: string } {
  if (!Number.isInteger(refresh) || refresh < 5 || refresh > 120) return { refresh: 'Refresh every 5 to 120 minutes' }
  if (!Number.isInteger(stale) || stale < refresh || stale > 720) return { stale: 'Stale-after must be from the refresh interval up to 720 minutes' }
  return {}
}

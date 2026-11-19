type Sun = { sunrise: string | null; sunset: string | null }
export type SunEvent = { label: 'Sunrise' | 'Sunset'; at: string }

/** The next sun event and the other one; sunrise is next before dawn and after dusk. Null on a polar day or night. */
export function sunEvents(sun: Sun, now: number = Date.now()): { next: SunEvent; other: SunEvent } | null {
  if (!sun.sunrise || !sun.sunset) return null
  const rise: SunEvent = { label: 'Sunrise', at: sun.sunrise }
  const set: SunEvent = { label: 'Sunset', at: sun.sunset }
  const daytime = now >= Date.parse(sun.sunrise) && now < Date.parse(sun.sunset)
  return daytime ? { next: set, other: rise } : { next: rise, other: set }
}

/** "11 h 45 min of daylight", or null without both times. */
export function daylight(sun: Sun): string | null {
  if (!sun.sunrise || !sun.sunset) return null
  const minutes = Math.round((Date.parse(sun.sunset) - Date.parse(sun.sunrise)) / 60_000)
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min of daylight`
}

import SunCalc from 'suncalc'

const PHASES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'] as const

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** The moon's phase name (eighths centred on the four main phases) and how much of it is lit (0–1). */
export function moonPhase(date: Date): { name: string; fraction: number } {
  const { phase, fraction } = SunCalc.getMoonIllumination(date)
  return { name: PHASES[Math.round(phase * 8) % 8], fraction }
}

/** "3 h 20 min", "6 h" or "20 min". */
function duration(ms: number): string {
  const minutes = Math.round(ms / MINUTE)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/**
 * "3 h 20 min of daylight left" before today's sunset; "Sunrise in 6 h" before sunrise or after
 * sunset (then counting to about the same time tomorrow); "" without both times.
 */
export function daylightLeft(sun: { sunrise: string | null; sunset: string | null }, now: Date): string {
  if (!sun.sunrise || !sun.sunset) return ''
  const t = now.getTime()
  const rise = Date.parse(sun.sunrise)
  const set = Date.parse(sun.sunset)
  if (t < rise) return `Sunrise in ${duration(rise - t)}`
  if (t < set) return `${duration(set - t)} of daylight left`
  return `Sunrise in ${duration(rise + DAY - t)}`
}

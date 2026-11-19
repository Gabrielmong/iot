import type { WeatherCondition } from '../../../gql/graphql'
import { formatHour } from '../../../weather/lib/format'

type Hour = { time: string; condition: WeatherCondition; rainChance: number | null }
export type RainSoon = { at: string; chance: number } | 'now' | null

const HOUR = 3_600_000
const AHEAD = 12 * HOUR
const WET: ReadonlySet<WeatherCondition> = new Set(['RAIN', 'DRIZZLE', 'STORM'])

const rainy = (h: Hour) => (h.rainChance ?? 0) >= 50 || WET.has(h.condition)

/** The first rainy hour in the next 12 (a 50%+ chance, or rain, drizzle or a storm); `'now'` if it is the current hour. */
export function rainSoon(hourly: readonly Hour[], now: Date): RainSoon {
  const t = now.getTime()
  const hit = hourly.find((h) => {
    const start = Date.parse(h.time)
    return start + HOUR > t && start < t + AHEAD && rainy(h)
  })
  if (!hit) return null
  if (Date.parse(hit.time) <= t) return 'now'
  return { at: hit.time, chance: hit.rainChance ?? 0 }
}

/** "Raining now", "Rain likely around 3 PM (70%)" or "No rain in the next 12 h". */
export function rainSoonText(rain: RainSoon): string {
  if (rain === 'now') return 'Raining now'
  if (!rain) return 'No rain in the next 12 h'
  return `Rain likely around ${formatHour(rain.at)} (${rain.chance}%)`
}

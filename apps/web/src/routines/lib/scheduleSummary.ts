import type { ScheduleAnchor } from '../../gql/graphql'

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

type ScheduleRow = { time: string | null; anchor?: ScheduleAnchor; offsetMinutes?: number; days: readonly number[]; enabled: boolean }

const SUN_NAME = { SUNRISE: 'Sunrise', SUNSET: 'Sunset' } as const

/** "07:00", "Sunset", "Sunset −30 min", "Sunrise +15 min". */
export function scheduleWhen({ time, anchor = 'CLOCK', offsetMinutes = 0 }: Pick<ScheduleRow, 'time' | 'anchor' | 'offsetMinutes'>): string {
  if (anchor === 'CLOCK') return time ?? ''
  if (offsetMinutes === 0) return SUN_NAME[anchor]
  return `${SUN_NAME[anchor]} ${offsetMinutes < 0 ? '−' : '+'}${Math.abs(offsetMinutes)} min`
}

/** Weekdays (1 = Mon … 7 = Sun) as text: runs of 3+ become ranges ("Mon–Fri"), all 7 is "every day". */
export function daysLabel(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  if (sorted.length === 7) return 'every day'
  const parts: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++
    const name = (d: number) => DAY_NAMES[d - 1]
    if (j - i >= 2) parts.push(`${name(sorted[i]!)}–${name(sorted[j]!)}`)
    else for (let k = i; k <= j; k++) parts.push(name(sorted[k]!)!)
    i = j + 1
  }
  return parts.join(', ')
}

/** "07:00 Mon–Fri · Sunset −30 min Sat, Sun"; disabled rows are left out, "" when none. */
export function scheduleSummary(schedules: readonly ScheduleRow[]): string {
  return schedules
    .filter((s) => s.enabled)
    .map((s) => `${scheduleWhen(s)} ${daysLabel(s.days)}`)
    .join(' · ')
}

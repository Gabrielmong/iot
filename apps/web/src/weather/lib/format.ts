import { formatLastSeen } from '../../admin/lib/formatLastSeen'

/** "24°": whole degrees Celsius, never "-0°". */
export function formatTemp(c: number): string {
  const rounded = Math.round(c)
  return `${rounded === 0 ? 0 : rounded}°`
}

/** "Updated 5 min ago", "Updated just now". */
export function formatUpdated(iso: string, now: number = Date.now()): string {
  const ago = formatLastSeen(iso, now)
  return `Updated ${ago === 'Just now' ? 'just now' : ago}`
}

/** "3 PM" in the viewer's locale. */
export const formatHour = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric' })

/** "5:42 AM" in the viewer's locale. */
export const formatClock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** "Today", else the short weekday of a YYYY-MM-DD date. */
export function formatDay(date: string, today: Date = new Date()): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  if (day.toDateString() === today.toDateString()) return 'Today'
  return day.toLocaleDateString(undefined, { weekday: 'short' })
}

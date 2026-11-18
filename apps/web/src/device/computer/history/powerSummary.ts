import type { PowerEvent } from './powerSegments'

const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "Today", "Yesterday", "Sun" within the week, else "Nov 3". */
function dayLabel(d: Date, now: Date): string {
  const days = Math.round((midnight(now) - midnight(d)) / DAY_MS)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const latest = (events: PowerEvent[], on: boolean) => {
  const e = events.findLast((x) => x.on === on)
  return e && new Date(e.at)
}

/** "On since 18:42" (day named when not today) / "Last on Yesterday 23:10"; null when there is nothing to say. */
export function powerSummary(events: PowerEvent[], state: { on: boolean | null }, now: Date): string | null {
  if (state.on === null) return null
  const at = latest(events, state.on)
  if (!at) return null
  if (state.on) {
    const day = dayLabel(at, now)
    return day === 'Today' ? `On since ${hhmm(at)}` : `On since ${day} ${hhmm(at)}`
  }
  return `Last on ${dayLabel(at, now)} ${hhmm(at)}`
}

export type PowerEvent = { on: boolean; at: string }
export type PowerSegment = { start: Date; end: Date; on: boolean | null }

/**
 * Splits [from, to] into on / off stretches from the PC's On/Off changes (oldest first). An event from
 * before `from` sets the state the range starts in; time before the first known event is unknown (null).
 */
export function powerSegments(events: PowerEvent[], from: Date, to: Date): PowerSegment[] {
  const segments: PowerSegment[] = []
  let start = from
  let on: boolean | null = null
  for (const e of events) {
    const at = new Date(e.at)
    if (at > to) break
    if (at > start) {
      segments.push({ start, end: at, on })
      start = at
    }
    on = e.on
  }
  segments.push({ start, end: to, on })
  return segments
}

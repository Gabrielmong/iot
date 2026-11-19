/**
 * Who may stream live: `live` holds the granted keys, oldest first (at most `max`); `waiting` holds
 * keys that want to stream, first in line first, and get a slot as soon as one frees up.
 */
export type Slots = { readonly live: readonly string[]; readonly waiting: readonly string[] }

export const MAX_LIVE = 2
export const EMPTY_SLOTS: Slots = { live: [], waiting: [] }

const has = (s: Slots, key: string) => s.live.includes(key) || s.waiting.includes(key)

/** A camera wants to stream: live if a slot is free, else it waits. */
export function request(s: Slots, key: string, max = MAX_LIVE): Slots {
  if (has(s, key)) return s
  return s.live.length < max ? { ...s, live: [...s.live, key] } : { ...s, waiting: [...s.waiting, key] }
}

/** The viewer tapped Play: this one goes live now; the oldest live one stops and waits. */
export function take(s: Slots, key: string, max = MAX_LIVE): Slots {
  if (s.live.includes(key)) return s
  const live = [...s.live, key]
  const evicted = live.splice(0, Math.max(0, live.length - max))
  return { live, waiting: [...s.waiting.filter((k) => k !== key), ...evicted] }
}

/** A camera no longer wants to stream (off screen, hidden page, gone): its slot passes to the first waiting. */
export function release(s: Slots, key: string, max = MAX_LIVE): Slots {
  if (!has(s, key)) return s
  const live = s.live.filter((k) => k !== key)
  const waiting = s.waiting.filter((k) => k !== key)
  const promoted = waiting.slice(0, Math.max(0, max - live.length))
  return { live: [...live, ...promoted], waiting: waiting.slice(promoted.length) }
}

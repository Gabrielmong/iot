/** A frame older than this is never shown as current. */
export const STALE_AFTER_SECONDS = 60

/** `X-Frame-Age` in seconds; missing or malformed counts as infinitely old. */
export function parseFrameAge(header: string | null): number {
  if (header === null || header.trim() === '') return Number.POSITIVE_INFINITY
  const age = Number(header)
  return Number.isFinite(age) && age >= 0 ? age : Number.POSITIVE_INFINITY
}

/** Stale: the last request failed, or the frame is older than 60 s. */
export const isThumbnailStale = (ageSeconds: number | null, failed: boolean): boolean =>
  failed || (ageSeconds !== null && ageSeconds > STALE_AFTER_SECONDS)

/** "12 s ago". */
export const formatFrameAge = (ageSeconds: number): string => `${Math.round(ageSeconds)} s ago`

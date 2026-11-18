const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** Binary sizes with the labels Windows shows: "7.8 GB", "120 GB" (one decimal below 10). */
export function formatBytes(n: number): string {
  let value = Math.max(0, n)
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const shown = unit === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1)
  return `${shown} ${UNITS[unit]}`
}

/** "1.2 MB/s". */
export function formatRate(bytesPerS: number): string {
  return `${formatBytes(bytesPerS)}/s`
}

/** The two largest units: "3 d 4 h", "2 h 5 min", "12 min", "45 s". */
export function formatDuration(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const min = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${min} min`
  if (min > 0) return `${min} min`
  return `${Math.floor(s)} s`
}

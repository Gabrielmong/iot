/** "Never", "Just now", "5 min ago", "3 h ago" or a date, for a device's last sighting. */
export function formatLastSeen(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'Never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Never'
  const minutes = Math.floor((now - then) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`
  return new Date(then).toLocaleDateString()
}

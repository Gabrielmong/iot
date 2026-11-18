import type { Device } from '../types'

/** A PC's wake progress as the server follows it ("Waking…", "On after 23 s", ...), or null when none is shown. */
export function computerStatus(d: Device): string | null {
  const wake = d.computer?.wake
  if (!wake) return null
  switch (wake.status) {
    case 'WAKING':
      return 'Waking…'
    case 'WOKE':
      return `On after ${wake.seconds ?? 0} s`
    case 'FAILED':
      return "Didn't wake"
    case 'UNCONFIRMED':
      return "Wake sent, can't confirm"
  }
}

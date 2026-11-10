import { useLocation } from 'react-router'

/** Where the device page's back arrow goes: the room it was opened from (router state), else the dashboard. */
export function useBackTarget(): string {
  const from = (useLocation().state as { from?: unknown } | null)?.from
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/'
}

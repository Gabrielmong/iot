import { useEffect, useRef, useState } from 'react'
import type { DeviceDetail } from '../types'
import { openUrl } from './openUrl'

/** Longer than the server's 2 min wake watch: if no result arrives by then, stop waiting. */
const GIVE_UP_MS = 150_000

/**
 * `start()` opens `url` at once when the PC is on; otherwise it wakes the PC and opens `url` once the
 * server reports it woke, giving up quietly if it didn't, if the wake command failed, or if no result
 * arrives in time. Only a *new* wake status counts, so a result left over from an earlier wake can't
 * end this one. If the browser blocks the delayed open, the PC is on by then and a second click opens it.
 */
export function useWakeThenOpen(device: DeviceDetail, url: string | null, wake: () => Promise<boolean> | void) {
  const [pending, setPending] = useState(false)
  const lastStatus = useRef<string | null>(null)
  const status = device.computer?.wake?.status ?? null

  useEffect(() => {
    if (!pending || status === lastStatus.current) return
    lastStatus.current = status
    if (status === 'WOKE' && url) openUrl(url)
    if (status === 'WOKE' || status === 'FAILED' || status === 'UNCONFIRMED') setPending(false)
  }, [pending, status, url])

  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => setPending(false), GIVE_UP_MS)
    return () => clearTimeout(timer)
  }, [pending])

  const start = () => {
    if (!url) return
    if (device.state.on === true) return openUrl(url)
    lastStatus.current = status
    setPending(true)
    void Promise.resolve(wake()).then((ok) => {
      if (ok === false) setPending(false)
    })
  }
  return { start, pending }
}

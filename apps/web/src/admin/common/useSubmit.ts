import { useCallback, useState } from 'react'
import { adminErrorMessage } from '../lib/adminErrorMessage'

/**
 * Runs an async admin action, tracking `pending` and the friendly `error` text.
 * `onDone` runs after success (typically closing a dialog).
 */
export function useSubmit(run: () => Promise<unknown>, onDone: () => void) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = useCallback(async () => {
    setPending(true)
    setError(null)
    try {
      await run()
      onDone()
    } catch (e) {
      setError(adminErrorMessage(e))
    } finally {
      setPending(false)
    }
  }, [run, onDone])
  return { submit, pending, error }
}

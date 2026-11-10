import { useMutation } from '@apollo/client/react'
import { useCallback, useState } from 'react'
import { adminErrorMessage } from '../lib/adminErrorMessage'
import { SYNC_TUYA_KEYS } from './documents'

/** Runs the Tuya key sync on demand and keeps its latest result or error text. */
export function useTuyaSync() {
  const [mutate, { loading }] = useMutation(SYNC_TUYA_KEYS, { refetchQueries: ['AdminDevices', 'Integrations'] })
  const [result, setResult] = useState<{ matched: number; unmatched: string[]; found: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sync = useCallback(async () => {
    setError(null)
    setResult(null)
    try {
      const { data } = await mutate()
      if (data) setResult(data.syncTuyaKeys)
    } catch (e) {
      setError(adminErrorMessage(e))
    }
  }, [mutate])
  return { sync, syncing: loading, result, error }
}

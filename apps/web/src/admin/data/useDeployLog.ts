import { useQuery } from '@apollo/client/react'
import { useEffect, useRef, useState } from 'react'
import { DEPLOY_LOG } from './deployDocuments'

const LOG_POLL_MS = 2000

/** One event's log; polled every 2 s while `live`. Keeps the last text if a poll fails. */
export function useDeployLog(eventId: string | null, live: boolean) {
  const [kept, setKept] = useState<{ id: string | null; log: string | null }>({ id: null, log: null })
  const { data, loading, refetch } = useQuery(DEPLOY_LOG, {
    variables: { eventId: eventId ?? '' },
    skip: eventId === null,
    pollInterval: live ? LOG_POLL_MS : 0,
    fetchPolicy: 'cache-and-network',
  })
  // The last lines can land after the final poll: fetch once more when the event stops being live.
  const wasLive = useRef(live)
  useEffect(() => {
    if (wasLive.current && !live && eventId !== null) void refetch().catch(() => {})
    wasLive.current = live
  }, [live, eventId, refetch])
  const fresh = data ? (data.deployLog ?? null) : undefined
  if (fresh !== undefined && (kept.id !== eventId || kept.log !== fresh)) setKept({ id: eventId, log: fresh })
  const log = fresh !== undefined ? fresh : kept.id === eventId ? kept.log : null
  return { log, loading: loading && data === undefined }
}

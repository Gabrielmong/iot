import { useQuery } from '@apollo/client/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeployStatusQuery } from '../../gql/graphql'
import { DEPLOY_STATUS } from './deployDocuments'

export type DeployStatus = DeployStatusQuery['deployStatus']
export type DeployEvent = DeployStatus['events'][number]

const IDLE_POLL_MS = 5000
const BUSY_POLL_MS = 2000
/** How long after a command the app may legitimately be unreachable (it restarts itself). */
const RESTART_WINDOW_MS = 90_000
/** After this long without a good status, stop saying "Restarting…" and say the app hasn't come back. */
const NOT_BACK_MS = 180_000

/**
 * The deploy status, polled. While the app server restarts mid-deploy the poll fails;
 * that is `restarting` (the last good status stays on screen and `error` is hidden).
 * `notBack` replaces it once the polls have failed for 3 minutes (from the first failed
 * poll, i.e. within one poll of the last good status). Call `noteCommand` when the page sends a command.
 */
export function useDeployStatus() {
  const [lastGood, setLastGood] = useState<DeployStatus | null>(null)
  const [recentCommand, setRecentCommand] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const { data, error, refetch } = useQuery(DEPLOY_STATUS, {
    pollInterval: lastGood?.busy ? BUSY_POLL_MS : IDLE_POLL_MS,
  })
  // Keep the last good status; setting state while rendering re-renders at once, before commit.
  if (data && data.deployStatus !== lastGood) setLastGood(data.deployStatus)
  const status = data?.deployStatus ?? lastGood
  const down = Boolean(error) && (Boolean(lastGood?.busy) || recentCommand)
  const [gaveUp, setGaveUp] = useState(false)
  if (!down && gaveUp) setGaveUp(false) // back (or no longer expected down): start over next time

  useEffect(() => {
    if (!down) return
    const t = setTimeout(() => setGaveUp(true), NOT_BACK_MS)
    return () => clearTimeout(t)
  }, [down])
  useEffect(() => () => clearTimeout(timer.current), [])
  const noteCommand = useCallback(() => {
    setRecentCommand(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setRecentCommand(false), RESTART_WINDOW_MS)
  }, [])
  const refresh = useCallback(() => void refetch().catch(() => {}), [refetch])
  return {
    status,
    restarting: down && !gaveUp,
    notBack: down && gaveUp,
    error: down ? undefined : error,
    refetch: refresh,
    noteCommand,
  }
}

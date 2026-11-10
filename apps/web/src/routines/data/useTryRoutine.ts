import { useMutation, useSubscription } from '@apollo/client/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TRY_ID, type RoutineInput, type RoutineRun } from '../types'
import { ROUTINE_RUN_CHANGED, STOP_TRY, TRY_ROUTINE } from './documents'

/**
 * The editor's Try it: runs a draft once and follows its status (routineId "try"); errors are thrown.
 * A trial started here is stopped when the editor closes (including after Save), so it can't linger.
 */
export function useTryRun() {
  const [run, setRun] = useState<RoutineRun | null>(null)
  const [tryMutation] = useMutation(TRY_ROUTINE)
  const [stopMutation] = useMutation(STOP_TRY)
  const started = useRef(false)
  const stopRef = useRef(stopMutation)
  useEffect(() => {
    stopRef.current = stopMutation
  }, [stopMutation])
  useEffect(
    () => () => {
      if (started.current) void stopRef.current().catch(() => {})
    },
    [],
  )
  useSubscription(ROUTINE_RUN_CHANGED, {
    onData: ({ data: { data } }) => {
      const change = data?.routineRunChanged
      if (change?.routineId === TRY_ID) setRun(change.run)
    },
  })
  const tryDraft = useCallback(
    async (input: RoutineInput) => {
      started.current = true
      await tryMutation({ variables: { input } })
    },
    [tryMutation],
  )
  const stop = useCallback(async () => {
    await stopMutation()
  }, [stopMutation])
  return { run, tryDraft, stop }
}

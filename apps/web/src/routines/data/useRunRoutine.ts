import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { routineErrorMessage } from '../lib/routineErrorMessage'
import { RUN_ROUTINE, STOP_ROUTINE } from './documents'

/** `run(id)` and `stop(id)`; failures go to `onError` as readable text. Status arrives by subscription. */
export function useRunRoutine(onError: (message: string) => void) {
  const [runMutation] = useMutation(RUN_ROUTINE)
  const [stopMutation] = useMutation(STOP_ROUTINE)
  const run = useCallback(
    (id: string) => runMutation({ variables: { id } }).then(() => undefined, (e: unknown) => onError(routineErrorMessage(e))),
    [runMutation, onError],
  )
  const stop = useCallback(
    (id: string) => stopMutation({ variables: { id } }).then(() => undefined, (e: unknown) => onError(routineErrorMessage(e))),
    [stopMutation, onError],
  )
  return { run, stop }
}

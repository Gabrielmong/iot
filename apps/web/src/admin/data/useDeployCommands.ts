import { useMutation } from '@apollo/client/react'
import { useCallback, useRef, useState } from 'react'
import { DEPLOY_NOW, PAUSE_AUTO_DEPLOY, RESTART_APP, RESUME_AUTO_DEPLOY, ROLLBACK_DEPLOY } from './deployDocuments'

/**
 * The deploy commands. Each resolves (never rejects): a failure goes to `onError` with the
 * server's message. `onSent` runs as the command goes out (the app may go down before it answers),
 * `onDone` after a success (to refetch the status). One command at a time: `pending` while in flight.
 */
export function useDeployCommands(onSent: () => void, onError: (message: string) => void, onDone: () => void) {
  const [deployNow] = useMutation(DEPLOY_NOW)
  const [restartApp] = useMutation(RESTART_APP)
  const [pause] = useMutation(PAUSE_AUTO_DEPLOY)
  const [resume] = useMutation(RESUME_AUTO_DEPLOY)
  const [rollback] = useMutation(ROLLBACK_DEPLOY)

  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)

  const run = useCallback(
    async (send: () => Promise<unknown>) => {
      if (inFlight.current) return
      inFlight.current = true
      setPending(true)
      onSent()
      try {
        await send()
        onDone()
      } catch (e) {
        onError(e instanceof Error ? e.message : 'The command failed.')
      } finally {
        inFlight.current = false
        setPending(false)
      }
    },
    [onSent, onError, onDone],
  )

  return {
    pending,
    deployNow: useCallback(() => run(() => deployNow()), [run, deployNow]),
    restartApp: useCallback(() => run(() => restartApp()), [run, restartApp]),
    pause: useCallback(() => run(() => pause()), [run, pause]),
    resume: useCallback(() => run(() => resume()), [run, resume]),
    rollback: useCallback((sha: string) => run(() => rollback({ variables: { sha } })), [run, rollback]),
  }
}

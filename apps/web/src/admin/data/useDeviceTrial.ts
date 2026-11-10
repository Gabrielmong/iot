import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { useMutation } from '@apollo/client/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { END_DEVICE_TRIAL, SET_TRIAL_STATE, START_DEVICE_TRIAL } from './documents'

export type TrialPhase = 'idle' | 'starting' | 'ready' | 'error'

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Couldn't reach the device")

export const TRIAL_ENDED = 'Test ended after 2 minutes. Press Test to start again.'

/** The server ended the trial (2 minutes unused): it rejects switching with BAD_USER_INPUT. */
const trialEnded = (e: unknown) => CombinedGraphQLErrors.is(e) && e.errors.some((err) => err.extensions?.code === 'BAD_USER_INPUT')

/**
 * A Test session for an un-adopted device: `start` links it on the server and reads its real on/off
 * state, `set` switches it. The trial is ended when the component using it goes away.
 */
export function useDeviceTrial(deviceId: string) {
  const [phase, setPhase] = useState<TrialPhase>('idle')
  const [on, setOn] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const [startTrial] = useMutation(START_DEVICE_TRIAL)
  const [setTrial] = useMutation(SET_TRIAL_STATE)
  const [endTrial] = useMutation(END_DEVICE_TRIAL)

  const start = useCallback(async () => {
    setPhase('starting')
    setError(null)
    try {
      const { data } = await startTrial({ variables: { id: deviceId } })
      started.current = true
      setOn(data?.startDeviceTrial.state.on ?? false)
      setPhase('ready')
    } catch (e) {
      setError(message(e))
      setPhase('error')
    }
  }, [startTrial, deviceId])

  const set = useCallback(
    async (next: boolean) => {
      const before = on
      setOn(next)
      setError(null)
      try {
        const { data } = await setTrial({ variables: { id: deviceId, on: next } })
        setOn(data?.setTrialState.state.on ?? next)
      } catch (e) {
        if (trialEnded(e)) {
          started.current = false
          setOn(null)
          setPhase('idle')
          setError(TRIAL_ENDED)
          return
        }
        setOn(before)
        setError(message(e))
      }
    },
    [setTrial, deviceId, on],
  )

  useEffect(
    () => () => {
      if (started.current) void endTrial({ variables: { id: deviceId } }).catch(() => {})
    },
    [endTrial, deviceId],
  )

  return { phase, on, error, start: () => void start(), set: (next: boolean) => void set(next) }
}

import { useMutation } from '@apollo/client/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PairingMode } from '../../../gql/graphql'
import { CANCEL_TV_PAIRING, FINISH_TV_PAIRING, START_TV_PAIRING } from '../../data/tvComputerDocuments'
import { adminErrorMessage } from '../../lib/adminErrorMessage'

export type PairStep =
  | { kind: 'starting' }
  | { kind: 'code'; error: string | null; busy: boolean }
  | { kind: 'accept' }
  | { kind: 'done' }
  | { kind: 'failed'; error: string }

const refresh = { refetchQueries: ['AdminDevices'], awaitRefetchQueries: true }

/**
 * Drives one pairing: starts it on mount; CODE waits for `submitCode`, ACCEPT_ON_TV finishes at once
 * (the server waits for the TV). `cancel` drops a pairing that hasn't finished.
 */
export function usePairTv(deviceId: string) {
  const [step, setStep] = useState<PairStep>({ kind: 'starting' })
  const [start] = useMutation(START_TV_PAIRING)
  const [finish] = useMutation(FINISH_TV_PAIRING, refresh)
  const [cancelMutation] = useMutation(CANCEL_TV_PAIRING)
  const settled = useRef(false)

  const complete = useCallback(
    async (code: string | null, onWrongCode?: (error: string) => void) => {
      try {
        await finish({ variables: { deviceId, code } })
        settled.current = true
        setStep({ kind: 'done' })
      } catch (e) {
        if (onWrongCode) onWrongCode(adminErrorMessage(e))
        else setStep({ kind: 'failed', error: adminErrorMessage(e) })
      }
    },
    [finish, deviceId],
  )

  useEffect(() => {
    let live = true
    start({ variables: { deviceId } })
      .then(({ data }) => {
        if (!live) return
        const mode: PairingMode | undefined = data?.startTvPairing
        if (mode === 'ACCEPT_ON_TV') {
          setStep({ kind: 'accept' })
          void complete(null)
        } else setStep({ kind: 'code', error: null, busy: false })
      })
      .catch((e: unknown) => live && setStep({ kind: 'failed', error: adminErrorMessage(e) }))
    return () => {
      live = false
    }
  }, [start, complete, deviceId])

  const submitCode = useCallback(
    (code: string) => {
      setStep({ kind: 'code', error: null, busy: true })
      void complete(code, (error) => setStep({ kind: 'code', error, busy: false }))
    },
    [complete],
  )

  const cancel = useCallback(() => {
    if (!settled.current) void cancelMutation({ variables: { deviceId } }).catch(() => {})
  }, [cancelMutation, deviceId])

  return { step, submitCode, cancel }
}

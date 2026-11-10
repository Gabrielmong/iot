import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { SET_SWANN_RECORDER } from './documents'

/** Probes and saves the Swann recorder; resolves to the probe summary (`channels`, `codecs`). */
export function useSetSwannRecorder() {
  const [mutate] = useMutation(SET_SWANN_RECORDER, { refetchQueries: ['Integrations'], awaitRefetchQueries: true })
  return useCallback(
    async (host: string, username: string, password: string) => {
      const { data } = await mutate({ variables: { host, username, password } })
      if (!data) throw new Error('No result from the server')
      return data.setSwannRecorder
    },
    [mutate],
  )
}

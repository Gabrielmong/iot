import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { CREATE_AGENT_ENROLLMENT } from './agentDocuments'

/** `create()`: a one-time HomeAgent download link (valid 30 minutes). Rejects on failure. */
export function useAgentEnrollment() {
  const [mutate] = useMutation(CREATE_AGENT_ENROLLMENT)
  return useCallback(async () => {
    const { data } = await mutate()
    if (!data) throw new Error("Couldn't create a download link")
    return data.createAgentEnrollment.downloadUrl
  }, [mutate])
}

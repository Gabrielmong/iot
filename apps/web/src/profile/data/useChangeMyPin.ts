import { useMutation } from '@apollo/client/react'
import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { useCallback, useState } from 'react'
import { formatLoginError } from '../../auth/formatLoginError'
import { CHANGE_MY_PIN } from './documents'

const GENERIC = 'Could not change PIN'

function message(error: unknown): string {
  if (CombinedGraphQLErrors.is(error)) {
    const input = error.errors.find((e) => e.extensions?.code === 'BAD_USER_INPUT')
    if (input) return input.message
    const text = formatLoginError(error)
    return text === 'Could not sign in' ? GENERIC : text
  }
  return formatLoginError(error)
}

/** Changes the signed-in user's own PIN. Resolves true on success; otherwise `error` has the text to show. */
export function useChangeMyPin() {
  const [mutate, { loading }] = useMutation(CHANGE_MY_PIN)
  const [error, setError] = useState<string | null>(null)
  const change = useCallback(
    async (currentPin: string, newPin: string) => {
      setError(null)
      try {
        await mutate({ variables: { currentPin, newPin } })
        return true
      } catch (e) {
        setError(message(e))
        return false
      }
    },
    [mutate],
  )
  const clearError = useCallback(() => setError(null), [])
  return { change, error, loading, clearError }
}

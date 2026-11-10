import { CombinedGraphQLErrors } from '@apollo/client/errors'

export const GENERIC_LOGIN_ERROR = 'Could not sign in'
export const NETWORK_LOGIN_ERROR = 'Cannot reach the server'

/** Turns a login failure into the message shown under the PIN pad. */
export function formatLoginError(error: unknown): string {
  if (!CombinedGraphQLErrors.is(error)) return NETWORK_LOGIN_ERROR
  for (const { extensions } of error.errors) {
    if (extensions?.code === 'INVALID_PIN') return `Wrong PIN — ${extensions.attemptsLeft} tries left`
    if (extensions?.code === 'LOCKED') return `Locked — try again in ${extensions.retryAfterSeconds}s`
  }
  return GENERIC_LOGIN_ERROR
}

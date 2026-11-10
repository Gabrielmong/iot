import { CombinedGraphQLErrors } from '@apollo/client/errors'

/** Messages the server writes for people: input checks and "No access to <device>". */
const READABLE = new Set(['BAD_USER_INPUT', 'FORBIDDEN'])

/** Snackbar or form text for a failed routine action. */
export function routineErrorMessage(error: unknown): string {
  if (CombinedGraphQLErrors.is(error)) {
    const readable = error.errors.find((e) => READABLE.has(String(e.extensions?.code)))
    if (readable?.message) return readable.message
    if (error.errors.some((e) => e.extensions?.code === 'NOT_FOUND')) return 'That routine no longer exists.'
  }
  return 'Something went wrong. Try again.'
}

import { hasUnauthenticated } from '../../apollo/errorLink'

/**
 * Runs an action that ends the caller's own session. The session-ended flow sends them to /login,
 * so an UNAUTHENTICATED failure here is expected and must not show as an error.
 */
export async function ignoreUnauthenticated(run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    if (!hasUnauthenticated(error)) throw error
  }
}

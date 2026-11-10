import { getToken } from '../../auth/session'
import { endSession } from '../../auth/sessionEvents'

/**
 * Ends the session after a 401 / 4401 for a request made with `token`, unless that token is no
 * longer the current one (another request already ended the session), so many failing camera
 * requests end it only once.
 */
export function endSessionFor(token: string | null): void {
  if (token !== null && getToken() === token) endSession()
}

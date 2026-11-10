import { clearToken } from './session'

type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe to "the session ended" (logout, idle, expiry, 4401). Returns an unsubscribe. */
export function onSessionEnded(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Clears the stored token and tells the app (router redirect, cache reset, socket teardown). */
export function endSession(): void {
  clearToken()
  listeners.forEach((l) => l())
}

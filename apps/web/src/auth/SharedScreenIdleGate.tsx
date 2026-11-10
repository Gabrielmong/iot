import { isSharedScreen } from './session'
import { useIdleLogout } from './useIdleLogout'
import { useSessionKeepAlive } from './useSessionKeepAlive'
import { useSessionPing } from './useSessionPing'
import { useSignOut } from './useSignOut'

/**
 * Renders nothing. On a shared screen, signs out after the idle timeout and, while the person is
 * active, keeps the server session alive (it otherwise expires 3 min after the last command).
 */
export function SharedScreenIdleGate() {
  const shared = isSharedScreen()
  const signOut = useSignOut()
  const ping = useSessionPing()
  useIdleLogout(shared, signOut)
  useSessionKeepAlive(shared, ping)
  return null
}

import { CombinedGraphQLErrors } from '@apollo/client/errors'

/** Short text for a failed camera command: cloud trouble is "Couldn't reach the camera"; otherwise the server's message. */
export function cameraControlErrorMessage(error: unknown): string {
  if (!CombinedGraphQLErrors.is(error)) return "Couldn't reach the camera"
  const first = error.errors[0]
  const code = first?.extensions?.code
  if (typeof code === 'string' && code.startsWith('TUYA_CLOUD')) return "Couldn't reach the camera"
  return first?.message ?? "Couldn't reach the camera"
}

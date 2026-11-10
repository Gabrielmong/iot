import { CombinedGraphQLErrors } from '@apollo/client/errors'

/** Snackbar text for a failed `setDeviceState`. */
export function commandErrorMessage(error: unknown, deviceName: string): string {
  const notReady =
    CombinedGraphQLErrors.is(error) && error.errors.some((e) => e.extensions?.code === 'DEVICE_NOT_READY')
  return notReady ? `${deviceName} needs setup` : `Couldn't reach ${deviceName}`
}

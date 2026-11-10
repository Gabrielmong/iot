import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { useMutation } from '@apollo/client/react'
import { useCallback, useState } from 'react'
import { graphql } from '../../gql'
import type { TvApp, TvKey } from '../../gql/graphql'

const SEND_TV_KEY = graphql(`
  mutation SendTvKey($deviceId: ID!, $key: TvKey!) {
    sendTvKey(deviceId: $deviceId, key: $key)
  }
`)

const LAUNCH_TV_APP = graphql(`
  mutation LaunchTvApp($deviceId: ID!, $app: TvApp!) {
    launchTvApp(deviceId: $deviceId, app: $app)
  }
`)

const codeOf = (error: unknown) => (CombinedGraphQLErrors.is(error) ? error.errors[0]?.extensions?.code : undefined)

/** Snackbar text for a failed remote command. */
export function tvErrorMessage(error: unknown, name: string): string {
  const code = codeOf(error)
  if (code === 'DEVICE_UNREACHABLE') return `${name} isn’t answering`
  if (code === 'DEVICE_NOT_READY') return `${name} needs setup`
  return `Couldn’t reach ${name}`
}

/** `sendKey` / `launchApp` for one TV; `error` is the snackbar text of the last failure. */
export function useTvCommands(device: { id: string; name: string }) {
  const [error, setError] = useState<string | null>(null)
  const [sendKeyMutation] = useMutation(SEND_TV_KEY)
  const [launchMutation] = useMutation(LAUNCH_TV_APP)
  const report = useCallback((e: unknown) => setError(tvErrorMessage(e, device.name)), [device.name])
  const sendKey = useCallback(
    (key: TvKey) => void sendKeyMutation({ variables: { deviceId: device.id, key } }).catch(report),
    [sendKeyMutation, device.id, report],
  )
  const launchApp = useCallback(
    (app: TvApp) => void launchMutation({ variables: { deviceId: device.id, app } }).catch(report),
    [launchMutation, device.id, report],
  )
  const clearError = useCallback(() => setError(null), [])
  return { sendKey, launchApp, error, setError, clearError }
}

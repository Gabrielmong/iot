import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { SET_GOOGLE_MAPS_KEY, SET_XWEATHER_CREDENTIALS, TEST_XWEATHER } from './documents'

/** Saves the Xweather client ID and secret; the weather refetches on the server. */
export function useSetXweatherCredentials() {
  const [mutate] = useMutation(SET_XWEATHER_CREDENTIALS, { refetchQueries: ['Integrations', 'Weather'], awaitRefetchQueries: true })
  return useCallback((clientId: string, clientSecret: string) => mutate({ variables: { clientId, clientSecret } }), [mutate])
}

/** Fetches the weather once with the saved credentials; rejects with XWEATHER_FAILED and the reason. */
export function useTestXweather() {
  const [mutate] = useMutation(TEST_XWEATHER)
  return useCallback(() => mutate(), [mutate])
}

/** Saves the Google Maps key the location map uses. */
export function useSetGoogleMapsKey() {
  const [mutate] = useMutation(SET_GOOGLE_MAPS_KEY, { refetchQueries: ['Integrations', 'MapsApiKey'], awaitRefetchQueries: true })
  return useCallback((apiKey: string) => mutate({ variables: { apiKey } }), [mutate])
}

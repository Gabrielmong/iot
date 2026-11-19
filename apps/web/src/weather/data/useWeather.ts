import { useApolloClient, useQuery, useSubscription } from '@apollo/client/react'
import { backgroundContext } from '../../apollo'
import type { WeatherFieldsFragment } from '../../gql/graphql'
import { WEATHER, WEATHER_UPDATED } from './documents'

export type Weather = WeatherFieldsFragment

/**
 * The home's weather, kept live by `weatherUpdated` (each event replaces the cached weather).
 * Background context: the weather refreshing on its own must not slide a shared screen's idle session.
 */
export function useWeather(): { weather: Weather | undefined; loading: boolean } {
  const client = useApolloClient()
  const { data, loading } = useQuery(WEATHER, { context: backgroundContext })
  useSubscription(WEATHER_UPDATED, {
    onData: ({ data: event }) => {
      if (event.data) client.writeQuery({ query: WEATHER, data: { weather: event.data.weatherUpdated } })
    },
  })
  return { weather: data?.weather, loading }
}

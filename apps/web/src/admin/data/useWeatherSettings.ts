import { useMutation, useQuery } from '@apollo/client/react'
import { useCallback } from 'react'
import type { WeatherSettingsInput } from '../../gql/graphql'
import { MAPS_API_KEY, UPDATE_WEATHER_SETTINGS, WEATHER_SETTINGS } from './documents'

/** The household pin and weather options, plus when the weather last updated. */
export function useWeatherSettingsQuery() {
  const { data, error, refetch } = useQuery(WEATHER_SETTINGS)
  const retry = useCallback(() => void refetch().catch(() => {}), [refetch])
  return { settings: data?.weatherSettings ?? null, updatedAt: data?.weather.updatedAt ?? null, error, retry }
}

/** Saves the whole settings row; the server refetches the weather. */
export function useUpdateWeatherSettings() {
  const [mutate] = useMutation(UPDATE_WEATHER_SETTINGS, { refetchQueries: ['WeatherSettings', 'Weather'] })
  return useCallback((input: WeatherSettingsInput) => mutate({ variables: { input } }), [mutate])
}

/** The Google Maps key for drawing the map: undefined while loading, null when none is saved. */
export function useMapsApiKey(): string | null | undefined {
  const { data, error } = useQuery(MAPS_API_KEY)
  if (error) return null
  return data ? (data.mapsApiKey ?? null) : undefined
}

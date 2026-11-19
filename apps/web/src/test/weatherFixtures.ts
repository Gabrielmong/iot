import type { WeatherQuery } from '../gql/graphql'

type Weather = WeatherQuery['weather']

const HOUR_MS = 3_600_000

/** A full OK reading: 24° and clear, 12 hours and 5 days ahead, today's sun times. With __typename, which Apollo needs to match the fragment. */
export function weatherFixture(over: Partial<Weather> = {}, now = Date.now()): Weather {
  const start = Math.ceil(now / HOUR_MS) * HOUR_MS
  const day = (i: number) => new Date(now + i * 24 * HOUR_MS).toLocaleDateString('en-CA')
  return {
    __typename: 'Weather',
    status: 'OK',
    updatedAt: new Date(now - 60_000).toISOString(),
    stale: false,
    current: { __typename: 'CurrentWeather', tempC: 23.6, feelsLikeC: 25.2, humidity: 70, windKph: 12, condition: 'CLEAR', isDay: true, precipMm: 0 },
    hourly: Array.from({ length: 12 }, (_, i) => ({ __typename: 'HourlyWeather' as const, time: new Date(start + i * HOUR_MS).toISOString(), tempC: 10 + i, condition: 'PARTLY_CLOUDY' as const, rainChance: i * 5 })),
    daily: Array.from({ length: 5 }, (_, i) => ({ __typename: 'DailyWeather' as const, date: day(i), minC: 17 + i, maxC: 27 + i, condition: 'RAIN' as const, rainChance: 60 })),
    sun: { __typename: 'SunTimes', sunrise: new Date(now - 6 * HOUR_MS).toISOString(), sunset: new Date(now + 6 * HOUR_MS).toISOString() },
    ...over,
  } as Weather
}

/** Weather with no reading, e.g. NOT_CONFIGURED or NO_LOCATION. */
export const emptyWeather = (status: Weather['status']): Weather => ({ __typename: 'Weather', status, updatedAt: null, stale: false, current: null, hourly: [], daily: [], sun: null }) as Weather

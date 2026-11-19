import type { WeatherStatus } from '../../../gql/graphql'

const TEXT: Record<WeatherStatus, string> = {
  NOT_CONFIGURED: "Weather isn't set up",
  NO_LOCATION: 'Set the home location',
  DISABLED: 'Weather is off',
  ERROR: 'No weather yet',
  OK: 'No weather yet',
}

/** Why the weather widget has no reading. */
export const missingWeather = (status: WeatherStatus) => TEXT[status]

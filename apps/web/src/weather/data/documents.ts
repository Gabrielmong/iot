import { graphql } from '../../gql'

export const WEATHER_FIELDS = graphql(`
  fragment WeatherFields on Weather {
    status
    updatedAt
    stale
    current { tempC feelsLikeC humidity windKph condition isDay precipMm }
    hourly { time tempC condition rainChance }
    daily { date minC maxC condition rainChance }
    sun { sunrise sunset }
  }
`)

export const WEATHER = graphql(`
  query Weather {
    weather { ...WeatherFields }
  }
`)

export const WEATHER_UPDATED = graphql(`
  subscription WeatherUpdated {
    weatherUpdated { ...WeatherFields }
  }
`)

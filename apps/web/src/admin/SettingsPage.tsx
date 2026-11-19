import { useQuery } from '@apollo/client/react'
import CircularProgress from '@mui/material/CircularProgress'
import { HOME_NAME } from '../home/data/documents'
import { PageSection } from './common/PageSection'
import { QueryError } from './common/QueryError'
import { useWeatherSettingsQuery } from './data/useWeatherSettings'
import { HomeLocationCard } from './settings/HomeLocationCard'
import { HomeNameForm } from './settings/HomeNameForm'
import { WeatherOptionsCard } from './settings/WeatherOptionsCard'

/** Admin settings: household-wide preferences such as the home's name, location and weather. */
export function SettingsPage() {
  const { data, error, refetch } = useQuery(HOME_NAME)
  const weather = useWeatherSettingsQuery()
  if (error && !data) return <QueryError what="settings" onRetry={() => void refetch().catch(() => {})} />
  return (
    <>
      <PageSection title="Personalize">
        {data ? <HomeNameForm current={data.homeName} /> : <CircularProgress size={24} />}
      </PageSection>
      {weather.error && !weather.settings && <QueryError what="weather settings" onRetry={weather.retry} />}
      {weather.settings && (
        <>
          <PageSection title="Home location">
            <HomeLocationCard settings={weather.settings} />
          </PageSection>
          <PageSection title="Weather">
            <WeatherOptionsCard settings={weather.settings} updatedAt={weather.updatedAt} />
          </PageSection>
        </>
      )}
    </>
  )
}

import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCurrentUser } from '../auth/useCurrentUser'
import { PageTransition } from '../motion/PageTransition'
import { useWeather } from '../weather/data/useWeather'
import { WeatherDetails } from '../weather/WeatherDetails'
import { WeatherNotice } from '../weather/WeatherNotice'

/** `/weather`: now, the next hours, the next days and the sun, for everyone signed in. */
export function WeatherPage() {
  const { weather, loading } = useWeather()
  const { user } = useCurrentUser()
  return (
    <PageTransition>
      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Weather
        </Typography>
        {!weather && loading && <CircularProgress aria-label="Loading the weather" />}
        {weather && (!weather.current || weather.status !== 'OK') && <WeatherNotice status={weather.status} isAdmin={user?.role === 'ADMIN'} />}
        {weather && weather.current && <WeatherDetails weather={weather} />}
        {weather && !weather.current && weather.sun && <WeatherDetails weather={weather} />}
      </Stack>
    </PageTransition>
  )
}

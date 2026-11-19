import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Link from '@mui/material/Link'
import { Link as RouterLink } from 'react-router'
import type { Weather } from './data/useWeather'

type Notice = { title: string; text: string; adminText: string; adminLink?: { to: string; label: string } }

const NOTICES: Partial<Record<Weather['status'], Notice>> = {
  NOT_CONFIGURED: {
    title: "Weather isn't set up",
    text: 'Ask an admin to connect Xweather.',
    adminText: 'Add the Xweather credentials.',
    adminLink: { to: '/admin/integrations/xweather', label: 'Open Integrations' },
  },
  NO_LOCATION: {
    title: 'Set the home location',
    text: 'Ask an admin to place the home on the map.',
    adminText: 'Place the home on the map.',
    adminLink: { to: '/admin/settings', label: 'Open Settings' },
  },
  DISABLED: { title: 'Weather is turned off', text: 'An admin turned off fetching the weather.', adminText: 'Turn it back on in Settings.', adminLink: { to: '/admin/settings', label: 'Open Settings' } },
  ERROR: { title: "Couldn't get the weather", text: 'It will try again on its own.', adminText: 'It will try again on its own. Check Xweather in Integrations.', adminLink: { to: '/admin/integrations/xweather', label: 'Open Integrations' } },
}

/** Why there's no weather to show, with where to fix it for admins. Null when there's nothing to say. */
export function WeatherNotice({ status, isAdmin }: { status: Weather['status']; isAdmin: boolean }) {
  const notice = NOTICES[status]
  if (!notice) return null
  return (
    <Alert severity="info">
      <AlertTitle>{notice.title}</AlertTitle>
      {isAdmin ? notice.adminText : notice.text}{' '}
      {isAdmin && notice.adminLink && (
        <Link component={RouterLink} to={notice.adminLink.to}>
          {notice.adminLink.label}
        </Link>
      )}
    </Alert>
  )
}

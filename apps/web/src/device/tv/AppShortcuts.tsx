import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { TvApp } from '../../gql/graphql'
import { TV_APPS } from './tvLabels'

/** One button per app this TV can open. */
export function AppShortcuts({ apps, onLaunch }: { apps: readonly TvApp[]; onLaunch: (app: TvApp) => void }) {
  if (apps.length === 0) return null
  return (
    <Box role="group" aria-label="Apps" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1 }}>
      {apps.map((app) => (
        <Button
          key={app}
          variant="outlined"
          color="inherit"
          onClick={() => onLaunch(app)}
          sx={{ minHeight: 56, borderRadius: '14px', borderLeft: `4px solid ${TV_APPS[app].color}` }}
        >
          {TV_APPS[app].label}
        </Button>
      ))}
    </Box>
  )
}

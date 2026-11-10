import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { Link as RouterLink } from 'react-router'
import { INTEGRATIONS, type IntegrationSlug } from '../lib/integrations'

type Props = { current: IntegrationSlug; configured: (slug: IntegrationSlug) => boolean }

/** One tab per integration with a green (set up) or grey (not set up) dot; each has its own URL. */
export function IntegrationTabs({ current, configured }: Props) {
  return (
    <Tabs value={current} variant="scrollable" scrollButtons="auto" aria-label="Integrations" sx={{ mb: 3 }}>
      {INTEGRATIONS.map((i) => (
        <Tab
          key={i.slug}
          value={i.slug}
          component={RouterLink}
          to={`/admin/integrations/${i.slug}`}
          iconPosition="start"
          icon={
            <Box
              aria-hidden
              sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: configured(i.slug) ? 'success.main' : 'text.disabled', mr: '2px !important' }}
            />
          }
          label={i.label}
        />
      ))}
    </Tabs>
  )
}

import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import type { Brand } from '../../gql/graphql'
import { PageSection } from '../common/PageSection'
import { useAdminDevices } from '../data/useAdminDevices'
import { HealthChip } from '../devices/HealthChip'
import { KindIcon } from '../devices/KindIcon'

/** The adopted devices this integration provides, each linking to its page. */
export function IntegrationDevices({ brand }: { brand: Brand }) {
  const { devices } = useAdminDevices()
  const used = devices.filter((d) => d.adopted && d.brand === brand)
  return (
    <PageSection title="Devices using it">
      {used.length === 0 ? (
        <Typography color="text.secondary">No devices use this yet.</Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
          {used.map((d) => (
            <Link
              key={d.id}
              component={RouterLink}
              to={`/devices/${d.id}`}
              underline="none"
              color="inherit"
              sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1, borderRadius: '8px', border: 1, borderColor: 'divider', '&:hover': { borderColor: 'primary.main' } }}
            >
              <KindIcon kind={d.kind} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontWeight: 600 }}>
                  {d.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {d.room?.name ?? 'No room'}
                </Typography>
              </Box>
              <HealthChip device={d} />
            </Link>
          ))}
        </Box>
      )}
    </PageSection>
  )
}

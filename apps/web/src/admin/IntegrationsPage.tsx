import CircularProgress from '@mui/material/CircularProgress'
import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router'
import { QueryError } from './common/QueryError'
import { useIntegrationsQuery } from './data/useIntegrations'
import { IntegrationDevices } from './integrations/IntegrationDevices'
import { IntegrationTabs } from './integrations/IntegrationTabs'
import { IntegrationView } from './integrations/IntegrationView'
import { KasaCredentialsForm } from './integrations/KasaCredentialsForm'
import { SwannRecorderForm } from './integrations/SwannRecorderForm'
import { TuyaCloudForm } from './integrations/TuyaCloudForm'
import { TuyaSyncPanel } from './integrations/TuyaSyncPanel'
import { defaultIntegration, integrationInfo, isIntegrationSlug, type IntegrationSlug } from './lib/integrations'

/** Each integration's own forms. */
function forms(slug: IntegrationSlug, swannConfigured: boolean): ReactNode {
  if (slug === 'tuya')
    return (
      <>
        <TuyaCloudForm />
        <TuyaSyncPanel />
      </>
    )
  if (slug === 'kasa') return <KasaCredentialsForm />
  return <SwannRecorderForm configured={swannConfigured} />
}

/**
 * Admin integrations, one tab per integration at /admin/integrations/:integration. A missing or
 * unknown integration opens the first one that isn't set up yet.
 */
export function IntegrationsPage() {
  const { integration } = useParams()
  const { status, error, retry } = useIntegrationsQuery()
  if (!status && error) return <QueryError what="integrations" onRetry={retry} />
  if (!status) return <CircularProgress aria-label="Loading integrations" />
  if (!isIntegrationSlug(integration)) return <Navigate to={`/admin/integrations/${defaultIntegration(status)}`} replace />

  const info = integrationInfo(integration)
  return (
    <>
      <IntegrationTabs current={integration} configured={(slug) => integrationInfo(slug).configured(status)} />
      <IntegrationView info={info} configured={info.configured(status)} lastSync={info.lastSync(status)}>
        {forms(integration, status.swannConfigured)}
      </IntegrationView>
      <IntegrationDevices brand={info.brand} />
    </>
  )
}

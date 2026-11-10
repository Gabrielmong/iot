import type { Brand, IntegrationsQuery } from '../../gql/graphql'

type IntegrationStatus = IntegrationsQuery['integrations']

export type IntegrationSlug = 'tuya' | 'kasa' | 'swann'

type Status = Pick<IntegrationStatus, 'tuyaCloudConfigured' | 'kasaConfigured' | 'swannConfigured'>
type Times = Partial<Pick<IntegrationStatus, 'tuyaLastSyncAt' | 'kasaLastSavedAt' | 'swannLastSyncAt'>>

export type IntegrationInfo = {
  slug: IntegrationSlug
  label: string
  brand: Brand
  description: string
  configured: (s: Status) => boolean
  lastSync: (s: Times) => string | null
}

/** The integrations, in tab order. */
export const INTEGRATIONS: readonly IntegrationInfo[] = [
  {
    slug: 'tuya',
    label: 'Tuya cloud',
    brand: 'TUYA',
    description: 'Smart Life devices: local keys and cloud cameras.',
    configured: (s) => s.tuyaCloudConfigured,
    lastSync: (s) => s.tuyaLastSyncAt ?? null,
  },
  {
    slug: 'kasa',
    label: 'TP-Link (Kasa)',
    brand: 'KASA',
    description: 'TP-Link Kasa plugs and switches on your network.',
    configured: (s) => s.kasaConfigured,
    lastSync: (s) => s.kasaLastSavedAt ?? null,
  },
  {
    slug: 'swann',
    label: 'Swann recorder',
    brand: 'SWANN',
    description: "The Swann recorder's wired cameras.",
    configured: (s) => s.swannConfigured,
    lastSync: (s) => s.swannLastSyncAt ?? null,
  },
]

export function isIntegrationSlug(s: string | undefined): s is IntegrationSlug {
  return INTEGRATIONS.some((i) => i.slug === s)
}

/** Where /admin/integrations opens: the first integration not set up yet, else Tuya. */
export function defaultIntegration(status: Status): IntegrationSlug {
  return INTEGRATIONS.find((i) => !i.configured(status))?.slug ?? 'tuya'
}

export function integrationInfo(slug: IntegrationSlug): IntegrationInfo {
  return INTEGRATIONS.find((i) => i.slug === slug) as IntegrationInfo
}

import { useQuery } from '@apollo/client/react'
import { useCallback } from 'react'
import { INTEGRATIONS } from './documents'

/** Integration status with its load error and a retry, for pages that must say when it failed. */
export function useIntegrationsQuery() {
  const { data, error, refetch } = useQuery(INTEGRATIONS)
  const retry = useCallback(() => void refetch().catch(() => {}), [refetch])
  return { status: data?.integrations ?? null, error, retry }
}

/** Whether Tuya cloud and TP-Link (Kasa) credentials are configured; `null` until known. */
export function useIntegrations() {
  const { data } = useQuery(INTEGRATIONS)
  return data?.integrations ?? null
}

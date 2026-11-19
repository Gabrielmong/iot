import { useMutation, useQuery } from '@apollo/client/react'
import { useCallback } from 'react'
import type { DashboardLayoutsQuery } from '../../../gql/graphql'
import type { LayoutEntry } from '../../lib/reconcileLayout'
import { DASHBOARD_LAYOUTS, RESET_DASHBOARD_LAYOUT, SAVE_DASHBOARD_LAYOUT } from './documents'

export type TabLayout = { entries: LayoutEntry[]; isDefault: boolean }

/** A stored item as an entry: a device or a widget (an item with neither is skipped). */
type StoredItem = DashboardLayoutsQuery['dashboardLayouts'][number]['items'][number]

function toEntry({ deviceId, widget, widgetId, targetId, size }: StoredItem): LayoutEntry[] {
  if (deviceId) return [{ deviceId, size }]
  if (!widget) return []
  return [{ widget, widgetId: widgetId ?? widget, ...(targetId ? { targetId } : {}), size }]
}

/** Resolve only once the refreshed layouts are in the cache, so leaving arrange mode never flashes the old one. */
const refetch = { refetchQueries: [DASHBOARD_LAYOUTS], awaitRefetchQueries: true }

/**
 * The caller's arrangement per tab (own or the admin default), whether it has loaded or failed, plus save and reset. Save and reset
 * resolve false instead of throwing, so the caller can keep the user's edits and show an error.
 */
export function useDashboardLayouts() {
  const { data, error } = useQuery(DASHBOARD_LAYOUTS, { fetchPolicy: 'cache-and-network' })
  const [saveMutation] = useMutation(SAVE_DASHBOARD_LAYOUT, refetch)
  const [resetMutation] = useMutation(RESET_DASHBOARD_LAYOUT, refetch)
  const layouts = data?.dashboardLayouts

  const layoutFor = useCallback(
    (tab: string): TabLayout | undefined => {
      const found = layouts?.find((l) => l.tab === tab)
      if (!found) return undefined
      return { entries: found.items.flatMap(toEntry), isDefault: found.isDefault }
    },
    [layouts],
  )

  const save = useCallback(
    (tab: string, entries: LayoutEntry[], asDefault: boolean) =>
      saveMutation({ variables: { tab, items: entries, asDefault } }).then(
        () => true,
        () => false,
      ),
    [saveMutation],
  )

  const reset = useCallback(
    (tab: string) =>
      resetMutation({ variables: { tab } }).then(
        () => true,
        () => false,
      ),
    [resetMutation],
  )

  return { layoutFor, save, reset, loaded: data !== undefined, failed: Boolean(error) && data === undefined }
}

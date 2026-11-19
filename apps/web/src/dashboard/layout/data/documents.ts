import { graphql } from '../../../gql'

export const DASHBOARD_LAYOUTS = graphql(`
  query DashboardLayouts {
    dashboardLayouts { tab isDefault items { deviceId widget widgetId targetId size } }
  }
`)

export const SAVE_DASHBOARD_LAYOUT = graphql(`
  mutation SaveDashboardLayout($tab: ID!, $items: [LayoutItemInput!]!, $asDefault: Boolean) {
    saveDashboardLayout(tab: $tab, items: $items, asDefault: $asDefault) { tab isDefault items { deviceId widget widgetId targetId size } }
  }
`)

export const RESET_DASHBOARD_LAYOUT = graphql(`
  mutation ResetDashboardLayout($tab: ID!) {
    resetDashboardLayout(tab: $tab) { tab isDefault items { deviceId widget widgetId targetId size } }
  }
`)

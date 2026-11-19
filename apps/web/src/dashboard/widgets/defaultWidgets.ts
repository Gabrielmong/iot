import type { Weather } from '../../weather/data/useWeather'
import { ALL_TAB, HOME_TAB } from '../lib/roomTabs'
import type { LayoutEntry } from '../lib/reconcileLayout'

const WEATHER_FIRST: readonly LayoutEntry[] = [{ widget: 'WEATHER', widgetId: 'WEATHER', size: 'W2x1' }]
const NONE: readonly LayoutEntry[] = []

/** What a tab with no saved layout starts with: the weather, wide, on Home and All once weather is working. */
export function defaultWidgets(tab: string, weather: Weather | undefined): readonly LayoutEntry[] {
  const working = weather?.status === 'OK' || weather?.status === 'ERROR'
  return (tab === ALL_TAB || tab === HOME_TAB) && working ? WEATHER_FIRST : NONE
}

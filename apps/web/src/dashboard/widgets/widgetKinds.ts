import type { WidgetKind } from '../../gql/graphql'
import type { Weather } from '../../weather/data/useWeather'
import type { TileSize } from '../lib/tileSize'

export type { WidgetKind }

export const WIDGET_KINDS: readonly WidgetKind[] = ['WEATHER', 'SUN']

export const WIDGET_LABEL: Record<WidgetKind, string> = { WEATHER: 'Weather', SUN: 'Sun' }

/** The size a widget starts at when added: weather wide, sun small. */
export const WIDGET_START_SIZE: Record<WidgetKind, TileSize> = { WEATHER: 'W2x1', SUN: 'S1x1' }

/** What a widget card is called: "Weather widget". */
export const widgetName = (kind: WidgetKind) => `${WIDGET_LABEL[kind]} widget`

/**
 * Whether a widget shows outside arrange mode: weather hides while it isn't set up or is switched
 * off (and until it loads); the sun shows whenever there are sun times.
 */
export function widgetShows(kind: WidgetKind, weather: Weather | undefined): boolean {
  if (!weather) return false
  if (kind === 'SUN') return weather.sun !== null
  return weather.status !== 'NOT_CONFIGURED' && weather.status !== 'DISABLED'
}

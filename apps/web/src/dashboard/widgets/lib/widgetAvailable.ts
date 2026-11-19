import type { WidgetTileInfo } from '../../lib/reconcileLayout'
import type { WidgetData } from '../useWidgetData'

const weatherWorks = (weather: WidgetData['weather']) => Boolean(weather) && weather!.status !== 'NOT_CONFIGURED' && weather!.status !== 'DISABLED'

/**
 * Whether a widget has something to show this viewer. Weather and rain soon need weather set up and on;
 * sun and moon need sun times (a home location); routine, camera and room widgets need their target
 * to exist and be visible. Clock and offline count always show.
 */
export function widgetAvailable({ widget, targetId }: Pick<WidgetTileInfo, 'widget' | 'targetId'>, data: WidgetData): boolean {
  switch (widget) {
    case 'WEATHER':
    case 'RAIN_SOON':
      return weatherWorks(data.weather)
    case 'SUN':
    case 'MOON':
      return Boolean(data.weather?.sun)
    case 'ROUTINE':
      return data.routines.some((r) => r.id === targetId)
    case 'CAMERA':
      return data.cameras.some((c) => c.id === targetId)
    case 'ROOM':
      return data.rooms.some((r) => r.id === targetId)
    default:
      return true
  }
}

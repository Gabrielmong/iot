import type { WidgetTileInfo } from '../../lib/reconcileLayout'

/** Where tapping a widget goes; none for widgets without a page (clock, moon) or with their own controls. */
export function widgetHref({ widget, targetId }: Pick<WidgetTileInfo, 'widget' | 'targetId'>): string | undefined {
  switch (widget) {
    case 'WEATHER':
    case 'SUN':
    case 'RAIN_SOON':
      return '/weather'
    case 'ROOM':
      return targetId ? `/rooms/${targetId}` : undefined
    case 'CAMERA':
      // The cameras page can't open one camera by link, so the widget opens the page as it is.
      return '/cameras'
    default:
      return undefined
  }
}

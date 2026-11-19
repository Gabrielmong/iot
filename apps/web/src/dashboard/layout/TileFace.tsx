import type { ArrangedTile } from '../lib/reconcileLayout'
import { DeviceTile } from '../tile/DeviceTile'
import { widgetAvailable } from '../widgets/lib/widgetAvailable'
import { UnavailableWidget } from '../widgets/UnavailableWidget'
import type { WidgetData } from '../widgets/useWidgetData'
import { WIDGET_TARGET, widgetName } from '../widgets/widgetKinds'
import { WidgetTile } from '../widgets/WidgetTile'

const noop = () => {}

/**
 * What a card looks like in arrange mode and while lifted: the device or widget, not wired to act. A
 * widget whose routine, camera or room is gone shows as "Not available" so it can be removed.
 */
export function TileFace({ tile, data }: { tile: ArrangedTile; data: WidgetData }) {
  if ('device' in tile) return <DeviceTile device={tile.device} isAdmin={false} onToggle={noop} onOpenDetails={noop} />
  if (WIDGET_TARGET[tile.widget] && !widgetAvailable(tile, data)) return <UnavailableWidget kind={tile.widget} />
  return <WidgetTile tile={tile} data={data} />
}

/** A card's name for labels: the device name, or "Weather widget". */
export const tileName = (tile: ArrangedTile) => ('device' in tile ? tile.device.name : widgetName(tile.widget))

import type { Weather } from '../../weather/data/useWeather'
import type { ArrangedTile } from '../lib/reconcileLayout'
import { DeviceTile } from '../tile/DeviceTile'
import { WidgetTile } from '../widgets/WidgetTile'
import { widgetName } from '../widgets/widgetKinds'

const noop = () => {}

/** What a card looks like in arrange mode and while lifted: the device or widget, not wired to act. */
export function TileFace({ tile, weather }: { tile: ArrangedTile; weather: Weather | undefined }) {
  if ('device' in tile) return <DeviceTile device={tile.device} isAdmin={false} onToggle={noop} onOpenDetails={noop} />
  return <WidgetTile kind={tile.widget} size={tile.size} weather={weather} />
}

/** A card's name for labels: the device name, or "Weather widget". */
export const tileName = (tile: ArrangedTile) => ('device' in tile ? tile.device.name : widgetName(tile.widget))

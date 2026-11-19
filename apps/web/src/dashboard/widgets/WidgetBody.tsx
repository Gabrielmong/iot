import type { WidgetTileInfo } from '../lib/reconcileLayout'
import { CameraWidget } from './CameraWidget'
import { ClockWidget } from './ClockWidget'
import { MoonWidget } from './MoonWidget'
import { OfflineWidget } from './OfflineWidget'
import { RainSoonWidget } from './RainSoonWidget'
import { RoomWidget } from './RoomWidget'
import { RoutineWidget } from './RoutineWidget'
import { SunWidget } from './SunWidget'
import type { WidgetData } from './useWidgetData'
import { WeatherWidget } from './WeatherWidget'

/** A widget's content, by kind. */
export function WidgetBody({ tile, data }: { tile: WidgetTileInfo; data: WidgetData }) {
  const { weather } = data
  switch (tile.widget) {
    case 'WEATHER':
      return weather ? <WeatherWidget weather={weather} size={tile.size} /> : null
    case 'SUN':
      return weather ? <SunWidget sun={weather.sun} size={tile.size} /> : null
    case 'RAIN_SOON':
      return weather ? <RainSoonWidget weather={weather} /> : null
    case 'MOON':
      return <MoonWidget sun={weather?.sun ?? null} />
    case 'CLOCK':
      return <ClockWidget size={tile.size} />
    case 'OFFLINE':
      return <OfflineWidget devices={data.devices} size={tile.size} />
    case 'ROUTINE': {
      const routine = data.routines.find((r) => r.id === tile.targetId)
      return routine ? <RoutineWidget routine={routine} /> : null
    }
    case 'CAMERA': {
      const camera = data.cameras.find((c) => c.id === tile.targetId)
      return camera ? <CameraWidget device={camera} /> : null
    }
    case 'ROOM': {
      const room = data.rooms.find((r) => r.id === tile.targetId)
      return room ? <RoomWidget room={room} devices={data.devices} /> : null
    }
  }
}

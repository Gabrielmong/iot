import { useMemo } from 'react'
import type { Routine } from '../../routines/types'
import { useRoutines } from '../../routines/data/useRoutines'
import { useWeather, type Weather } from '../../weather/data/useWeather'
import { roomTabs } from '../lib/roomTabs'
import { visibleTiles } from '../lib/visibleTiles'
import type { Device, Room } from '../types'

/** What widgets draw on: weather, and the routines, cameras, rooms (with something in them) and devices this viewer can see. */
export type WidgetData = {
  weather?: Weather
  routines: readonly Routine[]
  cameras: readonly Device[]
  rooms: readonly Room[]
  devices: readonly Device[]
}

export const NO_WIDGET_DATA: WidgetData = { routines: [], cameras: [], rooms: [], devices: [] }

/**
 * Live widget data around the devices and rooms the dashboard already holds (passed in, so their
 * queries and subscriptions are not opened twice).
 */
export function useWidgetData(all: readonly Device[], rooms: readonly Room[]): WidgetData {
  const { weather } = useWeather()
  const { routines } = useRoutines()
  return useMemo(() => {
    const devices = visibleTiles(all)
    return { weather, routines, rooms: roomTabs(rooms, devices), devices, cameras: devices.filter((d) => d.kind === 'CAMERA') }
  }, [weather, routines, rooms, all])
}

import type { WidgetKind } from '../../gql/graphql'
import type { TileSize } from '../lib/tileSize'

export type { WidgetKind }

/** Every widget, in "Add widget" menu order. */
export const WIDGET_KINDS: readonly WidgetKind[] = ['WEATHER', 'SUN', 'RAIN_SOON', 'MOON', 'CLOCK', 'ROUTINE', 'CAMERA', 'ROOM', 'OFFLINE']

export const WIDGET_LABEL: Record<WidgetKind, string> = {
  WEATHER: 'Weather',
  SUN: 'Sun',
  RAIN_SOON: 'Rain soon',
  MOON: 'Moon and daylight',
  CLOCK: 'Clock',
  ROUTINE: 'Routine button',
  CAMERA: 'Camera',
  ROOM: 'Room summary',
  OFFLINE: 'Devices offline',
}

/** The size a widget starts at when added. */
export const WIDGET_START_SIZE: Record<WidgetKind, TileSize> = {
  WEATHER: 'W2x1',
  SUN: 'S1x1',
  RAIN_SOON: 'W2x1',
  MOON: 'S1x1',
  CLOCK: 'W2x1',
  ROUTINE: 'S1x1',
  CAMERA: 'L2x2',
  ROOM: 'S1x1',
  OFFLINE: 'S1x1',
}

/** Widgets that point at something, and what: a routine, a camera or a room. */
export const WIDGET_TARGET: Partial<Record<WidgetKind, 'routine' | 'camera' | 'room'>> = { ROUTINE: 'routine', CAMERA: 'camera', ROOM: 'room' }

/** What a widget card is called: "Weather widget". */
export const widgetName = (kind: WidgetKind) => `${WIDGET_LABEL[kind]} widget`

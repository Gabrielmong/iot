import { deviceFixture } from '../../../test/deviceFixtures'
import { routineFixture } from '../../../test/routineFixtures'
import { emptyWeather, weatherFixture } from '../../../test/weatherFixtures'
import type { WidgetTileInfo } from '../../lib/reconcileLayout'
import type { WidgetData } from '../useWidgetData'
import type { WidgetKind } from '../widgetKinds'
import { widgetAvailable } from './widgetAvailable'

const cam = deviceFixture({ id: 'cam1', name: 'Door cam', kind: 'CAMERA' })
const data = (over: Partial<WidgetData> = {}): WidgetData => ({
  weather: weatherFixture(),
  routines: [routineFixture({ id: 'rt1' })],
  cameras: [cam],
  rooms: [{ id: 'r1', name: 'Living room', sortOrder: 0 }],
  devices: [cam],
  ...over,
})
const tile = (widget: WidgetKind, targetId?: string): WidgetTileInfo => ({ key: `widget:${widget}`, widget, widgetId: widget, size: 'S1x1', ...(targetId ? { targetId } : {}) })

describe('widgetAvailable', () => {
  it('always shows the clock and the offline count', () => {
    const none = data({ weather: undefined })
    expect(widgetAvailable(tile('CLOCK'), none)).toBe(true)
    expect(widgetAvailable(tile('OFFLINE'), none)).toBe(true)
  })

  it('shows weather and rain soon only while weather is working', () => {
    for (const kind of ['WEATHER', 'RAIN_SOON'] as const) {
      expect(widgetAvailable(tile(kind), data())).toBe(true)
      expect(widgetAvailable(tile(kind), data({ weather: emptyWeather('DISABLED') }))).toBe(false)
      expect(widgetAvailable(tile(kind), data({ weather: emptyWeather('NOT_CONFIGURED') }))).toBe(false)
      expect(widgetAvailable(tile(kind), data({ weather: undefined }))).toBe(false)
    }
  })

  it('shows sun and moon only with sun times', () => {
    for (const kind of ['SUN', 'MOON'] as const) {
      expect(widgetAvailable(tile(kind), data())).toBe(true)
      expect(widgetAvailable(tile(kind), data({ weather: emptyWeather('NO_LOCATION') }))).toBe(false)
    }
  })

  it('needs the routine, camera or room it points at', () => {
    expect(widgetAvailable(tile('ROUTINE', 'rt1'), data())).toBe(true)
    expect(widgetAvailable(tile('ROUTINE', 'gone'), data())).toBe(false)
    expect(widgetAvailable(tile('ROUTINE'), data())).toBe(false)
    expect(widgetAvailable(tile('CAMERA', 'cam1'), data())).toBe(true)
    expect(widgetAvailable(tile('CAMERA', 'cam1'), data({ cameras: [] }))).toBe(false)
    expect(widgetAvailable(tile('ROOM', 'r1'), data())).toBe(true)
    expect(widgetAvailable(tile('ROOM', 'r9'), data())).toBe(false)
  })
})

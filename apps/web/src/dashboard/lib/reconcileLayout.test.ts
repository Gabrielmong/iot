import { deviceFixture } from '../../test/deviceFixtures'
import { entryKey, type LayoutEntry, reconcileLayout } from './reconcileLayout'

const a = deviceFixture({ id: 'a' })
const b = deviceFixture({ id: 'b' })
const c = deviceFixture({ id: 'c' })
const view = (tiles: ReturnType<typeof reconcileLayout>) => tiles.map((t) => `${t.key}:${t.size}`)

describe('reconcileLayout', () => {
  it('uses server order at 1×1 when there is no layout', () => {
    expect(view(reconcileLayout(undefined, [a, b]))).toEqual(['a:S1x1', 'b:S1x1'])
  })

  it('keeps stored order and sizes, drops missing devices and appends new ones at 1×1', () => {
    const entries = [
      { deviceId: 'b', size: 'L2x2' as const },
      { deviceId: 'gone', size: 'S1x1' as const },
      { deviceId: 'a', size: 'W2x1' as const },
    ]
    expect(view(reconcileLayout(entries, [a, b, c]))).toEqual(['b:L2x2', 'a:W2x1', 'c:S1x1'])
  })

  it('drops a device that moved out of the tab', () => {
    const entries = [{ deviceId: 'a', size: 'L2x2' as const }, { deviceId: 'b', size: 'S1x1' as const }]
    expect(view(reconcileLayout(entries, [b]))).toEqual(['b:S1x1'])
  })

  it('uses the live device object, not a stale one', () => {
    const fresh = deviceFixture({ id: 'a', name: 'Renamed' })
    const [tile] = reconcileLayout([{ deviceId: 'a', size: 'S1x1' }], [fresh])
    expect('device' in tile && tile.device).toBe(fresh)
  })

  it('keeps widget entries where they are stored, whatever the devices', () => {
    const entries: LayoutEntry[] = [
      { deviceId: 'a', size: 'S1x1' },
      { widget: 'WEATHER', widgetId: 'WEATHER', size: 'W2x1' },
    ]
    expect(view(reconcileLayout(entries, [b, a]))).toEqual(['a:S1x1', 'widget:WEATHER:W2x1', 'b:S1x1'])
    expect(view(reconcileLayout([{ widget: 'SUN', widgetId: 'SUN', size: 'S1x1' }], []))).toEqual(['widget:SUN:S1x1'])
  })

  it('leaves unplaced devices out when not appending (Home)', () => {
    expect(view(reconcileLayout([{ deviceId: 'b', size: 'W2x1' }], [a, b, c], [], { appendUnplaced: false }))).toEqual(['b:W2x1'])
    expect(view(reconcileLayout(undefined, [a, b], [], { appendUnplaced: false }))).toEqual([])
  })

  it('keeps two widgets of one kind apart by their ids', () => {
    const entries: LayoutEntry[] = [
      { widget: 'ROUTINE', widgetId: 'w1', targetId: 'r1', size: 'S1x1' },
      { widget: 'ROUTINE', widgetId: 'w2', targetId: 'r2', size: 'S1x1' },
    ]
    expect(reconcileLayout(entries, [])).toEqual([
      { key: 'widget:w1', widget: 'ROUTINE', widgetId: 'w1', targetId: 'r1', size: 'S1x1' },
      { key: 'widget:w2', widget: 'ROUTINE', widgetId: 'w2', targetId: 'r2', size: 'S1x1' },
    ])
  })

  it('applies the defaults only when nothing is stored', () => {
    const defaults: LayoutEntry[] = [{ widget: 'WEATHER', widgetId: 'WEATHER', size: 'W2x1' }]
    expect(view(reconcileLayout(undefined, [a], defaults))).toEqual(['widget:WEATHER:W2x1', 'a:S1x1'])
    expect(view(reconcileLayout([], [a], defaults))).toEqual(['a:S1x1'])
  })
})

describe('entryKey', () => {
  it('is the device id, or widget: and the kind', () => {
    expect(entryKey({ deviceId: 'a', size: 'S1x1' })).toBe('a')
    expect(entryKey({ widget: 'SUN', widgetId: 'SUN', size: 'S1x1' })).toBe('widget:SUN')
  })
})

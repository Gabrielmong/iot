import { deviceFixture } from '../../test/deviceFixtures'
import { addWidget, moveEntry, moveEntryBy, removeWidget, resizeEntry, toEntries } from './arrangeOps'
import { entryKey, type LayoutEntry } from './reconcileLayout'

const list: LayoutEntry[] = [
  { deviceId: 'a', size: 'S1x1' },
  { deviceId: 'b', size: 'S1x1' },
  { deviceId: 'c', size: 'L2x2' },
]
const withWidget: LayoutEntry[] = [...list, { widget: 'WEATHER', size: 'W2x1' }]
const ids = (l: LayoutEntry[]) => l.map(entryKey)

describe('moveEntry', () => {
  it('moves the active entry to the position of the one it is over', () => {
    expect(ids(moveEntry(list, 'c', 'a'))).toEqual(['c', 'a', 'b'])
    expect(ids(moveEntry(list, 'a', 'c'))).toEqual(['b', 'c', 'a'])
  })

  it('moves a widget by its key', () => {
    expect(ids(moveEntry(withWidget, 'widget:WEATHER', 'a'))).toEqual(['widget:WEATHER', 'a', 'b', 'c'])
  })

  it('returns the list unchanged for unknown ids', () => {
    expect(moveEntry(list, 'x', 'a')).toBe(list)
    expect(moveEntry(list, 'a', 'x')).toBe(list)
  })
})

describe('resizeEntry', () => {
  it('changes only the named entry', () => {
    expect(resizeEntry(list, 'b', 'T1x2')).toEqual([list[0], { deviceId: 'b', size: 'T1x2' }, list[2]])
  })

  it('resizes a widget by its key', () => {
    expect(resizeEntry(withWidget, 'widget:WEATHER', 'L2x2')[3]).toEqual({ widget: 'WEATHER', size: 'L2x2' })
  })
})

describe('toEntries', () => {
  it('turns arranged tiles into entries', () => {
    expect(toEntries([{ key: 'z', device: deviceFixture({ id: 'z' }), size: 'W2x1' }])).toEqual([{ deviceId: 'z', size: 'W2x1' }])
    expect(toEntries([{ key: 'widget:SUN', widget: 'SUN', size: 'S1x1' }])).toEqual([{ widget: 'SUN', size: 'S1x1' }])
  })
})

describe('moveEntryBy', () => {
  it('moves an entry one place earlier or later in the list', () => {
    expect(ids(moveEntryBy(list, 'b', -1))).toEqual(['b', 'a', 'c'])
    expect(ids(moveEntryBy(list, 'b', 1))).toEqual(['a', 'c', 'b'])
    expect(ids(moveEntryBy(withWidget, 'widget:WEATHER', -1))).toEqual(['a', 'b', 'widget:WEATHER', 'c'])
  })

  it('stays put at the ends and for unknown ids', () => {
    expect(moveEntryBy(list, 'a', -1)).toBe(list)
    expect(moveEntryBy(list, 'c', 1)).toBe(list)
    expect(moveEntryBy(list, 'x', 1)).toBe(list)
  })
})

describe('addWidget', () => {
  it('puts the widget first: weather wide, sun small', () => {
    expect(addWidget(list, 'WEATHER')[0]).toEqual({ widget: 'WEATHER', size: 'W2x1' })
    expect(addWidget(list, 'SUN')[0]).toEqual({ widget: 'SUN', size: 'S1x1' })
  })

  it('refuses a kind the tab already has', () => {
    expect(addWidget(withWidget, 'WEATHER')).toBe(withWidget)
  })
})

describe('removeWidget', () => {
  it('drops only that widget', () => {
    expect(removeWidget(withWidget, 'WEATHER')).toEqual(list)
    expect(removeWidget(list, 'SUN')).toEqual(list)
  })
})

import { deviceFixture } from '../../test/deviceFixtures'
import { addWidget, moveEntry, moveEntryBy, removeEntry, resizeEntry, toEntries } from './arrangeOps'
import { entryKey, type LayoutEntry } from './reconcileLayout'

const list: LayoutEntry[] = [
  { deviceId: 'a', size: 'S1x1' },
  { deviceId: 'b', size: 'S1x1' },
  { deviceId: 'c', size: 'L2x2' },
]
const withWidget: LayoutEntry[] = [...list, { widget: 'WEATHER', widgetId: 'WEATHER', size: 'W2x1' }]
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
    expect(resizeEntry(withWidget, 'widget:WEATHER', 'L2x2')[3]).toEqual({ widget: 'WEATHER', widgetId: 'WEATHER', size: 'L2x2' })
  })
})

describe('toEntries', () => {
  it('turns arranged tiles into entries', () => {
    expect(toEntries([{ key: 'z', device: deviceFixture({ id: 'z' }), size: 'W2x1' }])).toEqual([{ deviceId: 'z', size: 'W2x1' }])
    expect(toEntries([{ key: 'widget:SUN', widget: 'SUN', widgetId: 'SUN', size: 'S1x1' }])).toEqual([{ widget: 'SUN', widgetId: 'SUN', size: 'S1x1' }])
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
  it('puts a new widget instance first at its starting size', () => {
    expect(addWidget(list, 'WEATHER', undefined, () => 'w1')[0]).toEqual({ widget: 'WEATHER', widgetId: 'w1', size: 'W2x1' })
    expect(addWidget(list, 'SUN', undefined, () => 'w2')[0]).toEqual({ widget: 'SUN', widgetId: 'w2', size: 'S1x1' })
  })

  it('adds a targeted widget with its target, and allows several of one kind', () => {
    const once = addWidget(list, 'ROUTINE', 'r1', () => 'w1')
    expect(once[0]).toEqual({ widget: 'ROUTINE', widgetId: 'w1', targetId: 'r1', size: 'S1x1' })
    expect(ids(addWidget(once, 'ROUTINE', 'r2', () => 'w2')).slice(0, 2)).toEqual(['widget:w2', 'widget:w1'])
  })
})

describe('removeEntry', () => {
  it('drops only the entry with that key', () => {
    expect(removeEntry(withWidget, 'widget:WEATHER')).toEqual(list)
    expect(removeEntry(list, 'b')).toEqual([list[0], list[2]])
    expect(removeEntry(list, 'x')).toEqual(list)
  })
})

import { deviceFixture } from '../../test/deviceFixtures'
import { moveEntry, moveEntryBy, resizeEntry, toEntries } from './arrangeOps'
import type { LayoutEntry } from './reconcileLayout'

const list: LayoutEntry[] = [
  { deviceId: 'a', size: 'S1x1' },
  { deviceId: 'b', size: 'S1x1' },
  { deviceId: 'c', size: 'L2x2' },
]
const ids = (l: LayoutEntry[]) => l.map((e) => e.deviceId)

describe('moveEntry', () => {
  it('moves the active entry to the position of the one it is over', () => {
    expect(ids(moveEntry(list, 'c', 'a'))).toEqual(['c', 'a', 'b'])
    expect(ids(moveEntry(list, 'a', 'c'))).toEqual(['b', 'c', 'a'])
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
})

describe('toEntries', () => {
  it('turns arranged tiles into entries', () => {
    expect(toEntries([{ device: deviceFixture({ id: 'z' }), size: 'W2x1' }])).toEqual([{ deviceId: 'z', size: 'W2x1' }])
  })
})

describe('moveEntryBy', () => {
  it('moves an entry one place earlier or later in the list', () => {
    expect(ids(moveEntryBy(list, 'b', -1))).toEqual(['b', 'a', 'c'])
    expect(ids(moveEntryBy(list, 'b', 1))).toEqual(['a', 'c', 'b'])
  })

  it('stays put at the ends and for unknown ids', () => {
    expect(moveEntryBy(list, 'a', -1)).toBe(list)
    expect(moveEntryBy(list, 'c', 1)).toBe(list)
    expect(moveEntryBy(list, 'x', 1)).toBe(list)
  })
})

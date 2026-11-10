import { reorderRooms } from './reorderRooms'

const rooms = [
  { id: 'a', sortOrder: 0 },
  { id: 'b', sortOrder: 1 },
  { id: 'c', sortOrder: 2 },
]

describe('reorderRooms', () => {
  it('swaps with the neighbour', () => {
    expect(reorderRooms(rooms, 'b', 'up')).toEqual([{ id: 'b', sortOrder: 0 }, { id: 'a', sortOrder: 1 }])
    expect(reorderRooms(rooms, 'b', 'down')).toEqual([{ id: 'c', sortOrder: 1 }, { id: 'b', sortOrder: 2 }])
  })

  it('does nothing at the ends', () => {
    expect(reorderRooms(rooms, 'a', 'up')).toEqual([])
    expect(reorderRooms(rooms, 'c', 'down')).toEqual([])
  })

  it('normalizes ties', () => {
    const tied = [{ id: 'a', sortOrder: 0 }, { id: 'b', sortOrder: 0 }]
    // b was already 0, so only a needs a new value
    expect(reorderRooms(tied, 'b', 'up')).toEqual([{ id: 'a', sortOrder: 1 }])
  })
})

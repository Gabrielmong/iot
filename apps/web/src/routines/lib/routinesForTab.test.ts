import { routineFixture } from '../../test/routineFixtures'
import { routinesForTab } from './routinesForTab'

const living = { id: 'r-living', name: 'Living room' }
const movie = routineFixture({ id: 'a', name: 'Movie night', room: living })
const bedtime = routineFixture({ id: 'b', name: 'Bedtime', room: null })
const reading = routineFixture({ id: 'c', name: 'Reading', room: living })

describe('routinesForTab', () => {
  it('shows every routine on All, by name', () => {
    expect(routinesForTab([movie, bedtime, reading], 'all').map((r) => r.name)).toEqual(['Bedtime', 'Movie night', 'Reading'])
  })

  it("shows only the room's routines on a room tab (whole-house ones only on All)", () => {
    expect(routinesForTab([movie, bedtime, reading], 'r-living').map((r) => r.name)).toEqual(['Movie night', 'Reading'])
    expect(routinesForTab([movie, bedtime], 'r-kitchen')).toEqual([])
  })
})

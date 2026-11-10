import { deviceFixture } from '../../test/deviceFixtures'
import { roomSummaries } from './roomSummaries'

const kitchen = { id: 'k', name: 'Kitchen', sortOrder: 2 }
const living = { id: 'l', name: 'Living room', sortOrder: 1 }
const garage = { id: 'g', name: 'Garage', sortOrder: 0 }

describe('roomSummaries', () => {
  it('one card per room with visible devices, by sortOrder, then All devices last', () => {
    const devices = [
      deviceFixture({ id: '1', room: kitchen, on: true }),
      deviceFixture({ id: '2', room: kitchen, on: false }),
      deviceFixture({ id: '3', room: living, on: false }),
      deviceFixture({ id: '4', room: null, on: true }),
    ]
    expect(roomSummaries(devices, [kitchen, living, garage])).toEqual([
      { id: 'l', name: 'Living room', deviceCount: 1, onCount: 0 },
      { id: 'k', name: 'Kitchen', deviceCount: 2, onCount: 1 },
      { id: 'all', name: 'All devices', deviceCount: 4, onCount: 2 },
    ])
  })

  it('counts a power strip as its outlets', () => {
    const strip = deviceFixture({ id: 's', room: kitchen })
    const outlets = [deviceFixture({ id: 'o1', parentId: 's', room: kitchen }), deviceFixture({ id: 'o2', parentId: 's', room: kitchen })]
    expect(roomSummaries([strip, ...outlets], [kitchen])[0]).toMatchObject({ id: 'k', deviceCount: 2 })
  })
})

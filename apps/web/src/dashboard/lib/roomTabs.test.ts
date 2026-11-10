import { deviceFixture } from '../../test/deviceFixtures'
import { devicesInTab, roomTabs } from './roomTabs'

const kitchen = { id: 'k', name: 'Kitchen', sortOrder: 2 }
const living = { id: 'l', name: 'Living room', sortOrder: 1 }
const empty = { id: 'e', name: 'Garage', sortOrder: 0 }

describe('roomTabs', () => {
  it('lists rooms with visible devices by sortOrder', () => {
    const devices = [deviceFixture({ id: '1', room: kitchen }), deviceFixture({ id: '2', room: living })]
    expect(roomTabs([kitchen, living, empty], devices)).toEqual([living, kitchen])
  })

  it('filters devices by tab, "all" keeps everything', () => {
    const a = deviceFixture({ id: '1', room: kitchen })
    const b = deviceFixture({ id: '2', room: null })
    expect(devicesInTab([a, b], 'all')).toEqual([a, b])
    expect(devicesInTab([a, b], 'k')).toEqual([a])
  })
})

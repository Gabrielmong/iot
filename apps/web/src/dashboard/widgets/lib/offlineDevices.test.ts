import { deviceFixture } from '../../../test/deviceFixtures'
import type { Device } from '../../types'
import { offlineDevices } from './offlineDevices'

const offline = (o: Parameters<typeof deviceFixture>[0]): Device => {
  const d = deviceFixture(o)
  return { ...d, state: { ...d.state, online: false } }
}

describe('offlineDevices', () => {
  it('lists adopted, set-up devices that are not responding, by name', () => {
    const plug = offline({ id: 'p', name: 'Plug', kind: 'PLUG' })
    const lamp = offline({ id: 'l', name: 'Lamp', kind: 'LIGHT' })
    const online = deviceFixture({ id: 'o', name: 'Online', kind: 'PLUG' })
    expect(offlineDevices([plug, online, lamp])).toEqual([lamp, plug])
  })

  it('leaves out computers and devices still waiting on setup', () => {
    const pc = offline({ id: 'pc', name: 'PC', kind: 'COMPUTER' })
    const pending = { ...offline({ id: 'n', name: 'New', kind: 'PLUG' }), status: 'NEEDS_KEY' as const }
    expect(offlineDevices([pc, pending])).toEqual([])
  })
})

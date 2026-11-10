import { adminDeviceFixture } from '../../test/adminFixtures'
import { deviceHealth, HEALTH_LABEL, healthCounts } from './deviceStatus'

describe('deviceHealth', () => {
  it('puts Needs setup ahead of Offline', () => {
    expect(deviceHealth({ status: 'NEEDS_KEY', online: false })).toBe('setup')
    expect(deviceHealth({ status: 'KEY_INVALID', online: true })).toBe('setup')
  })

  it('is Online or Offline for set-up devices', () => {
    expect(deviceHealth({ status: 'OK', online: true })).toBe('online')
    expect(deviceHealth({ status: 'OK', online: false })).toBe('offline')
  })

  it('labels each health', () => {
    expect(HEALTH_LABEL).toEqual({ online: 'Online', offline: 'Offline', setup: 'Needs setup' })
  })
})

describe('healthCounts', () => {
  it('counts devices per health', () => {
    const devices = [
      adminDeviceFixture({ id: 'a' }),
      adminDeviceFixture({ id: 'b', online: false }),
      adminDeviceFixture({ id: 'c', status: 'NEEDS_KEY', online: false }),
      adminDeviceFixture({ id: 'd', status: 'NEEDS_CREDENTIALS' }),
    ]
    expect(healthCounts(devices)).toEqual({ online: 1, offline: 1, setup: 2 })
  })
})

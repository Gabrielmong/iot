import { deviceFixture, lightFixture } from '../../test/deviceFixtures'
import { isDeviceOn } from './isDeviceOn'

describe('isDeviceOn', () => {
  it('reads light.on for lights, whose state.on is null', () => {
    expect(lightFixture({ on: true }).state.on).toBeNull()
    expect(isDeviceOn(lightFixture({ on: true }).state)).toBe(true)
    expect(isDeviceOn(lightFixture({ on: false }).state)).toBe(false)
  })

  it('reads state.on for switches and plugs', () => {
    expect(isDeviceOn(deviceFixture({ on: true }).state)).toBe(true)
    expect(isDeviceOn(deviceFixture({ on: false }).state)).toBe(false)
  })

  it('is false when nothing is known', () => {
    expect(isDeviceOn({ on: null, light: null })).toBe(false)
  })
})

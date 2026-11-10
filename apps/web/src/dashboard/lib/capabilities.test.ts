import { deviceFixture, lightFixture } from '../../test/deviceFixtures'
import { canToggle, lightCapabilities } from './capabilities'

describe('capabilities', () => {
  it('gives Govee and Tuya lights every light control', () => {
    for (const brand of ['GOVEE', 'TUYA'] as const) {
      expect(lightCapabilities(lightFixture({}, { brand }))).toEqual({ brightness: true, color: true, whiteTemp: true })
    }
  })

  it('gives switches, plugs and other lights no extra controls', () => {
    const none = { brightness: false, color: false, whiteTemp: false }
    expect(lightCapabilities(deviceFixture({ kind: 'PLUG' }))).toEqual(none)
    expect(lightCapabilities(lightFixture({}, { brand: 'KASA' }))).toEqual(none)
  })

  it('only toggles online, ready lights, switches and plugs', () => {
    expect(canToggle(deviceFixture({ kind: 'SWITCH' }))).toBe(true)
    expect(canToggle(lightFixture())).toBe(true)
    expect(canToggle(deviceFixture({ online: false }))).toBe(false)
    expect(canToggle(deviceFixture({ status: 'NEEDS_KEY' }))).toBe(false)
    expect(canToggle(deviceFixture({ kind: 'CAMERA' }))).toBe(false)
  })
})

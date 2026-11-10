import { deviceFixture, lightFixture } from '../../test/deviceFixtures'
import { stateLine } from './stateLine'

describe('stateLine', () => {
  it('shows color name and brightness for a light in color mode', () => {
    expect(stateLine(lightFixture({ color: { r: 155, g: 89, b: 255 }, brightness: 70 }))).toBe('Purple · 70%')
  })

  it('shows the white temperature name in white mode', () => {
    expect(stateLine(lightFixture({ mode: 'white', colorTempK: 3000, color: null, brightness: 40 }))).toBe('Warm · 40%')
  })

  it('shows Off for a light that is off', () => {
    expect(stateLine(lightFixture({ on: false }))).toBe('Off')
  })

  it('shows On/Off for plugs', () => {
    expect(stateLine(deviceFixture({ kind: 'PLUG', on: true }))).toBe('On')
    expect(stateLine(deviceFixture({ kind: 'PLUG', on: false }))).toBe('Off')
  })

  it('shows Offline when offline', () => {
    expect(stateLine(deviceFixture({ online: false }))).toBe('Offline')
  })

  it.each(['KEY_INVALID', 'NEEDS_KEY', 'NEEDS_CREDENTIALS'] as const)('shows Needs setup for %s', (status) => {
    expect(stateLine(deviceFixture({ status, online: false }))).toBe('Needs setup')
  })

  it('shows Online or Offline for cameras', () => {
    expect(stateLine(deviceFixture({ kind: 'CAMERA' }))).toBe('Online')
    expect(stateLine(deviceFixture({ kind: 'CAMERA', online: false }))).toBe('Offline')
  })

  it('shows Not supported yet for unknown devices', () => {
    expect(stateLine(deviceFixture({ kind: 'UNKNOWN' }))).toBe('Not supported yet')
  })
})

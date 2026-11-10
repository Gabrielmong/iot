import { deviceFixture, lightFixture } from '../../test/deviceFixtures'
import { DOT_OFF, dotColor } from './dotColor'

describe('dotColor', () => {
  it('uses the light color when on', () => {
    expect(dotColor(lightFixture())).toBe('rgb(155, 89, 255)')
  })

  it('is grey when off or offline', () => {
    expect(dotColor(lightFixture({ on: false }))).toBe(DOT_OFF)
    expect(dotColor(lightFixture({}, { online: false }))).toBe(DOT_OFF)
  })

  it('tints white mode by temperature', () => {
    const warm = dotColor(lightFixture({ mode: 'white', colorTempK: 2700, color: null }))
    const cool = dotColor(lightFixture({ mode: 'white', colorTempK: 6500, color: null }))
    expect(warm).not.toBe(cool)
    expect(warm).toMatch(/^rgb\(/)
  })

  it('is null for devices without light state', () => {
    expect(dotColor(deviceFixture())).toBeNull()
  })
})

import { deviceFixture, lightFixture } from '../../test/deviceFixtures'
import { applyPatch } from './applyPatch'

describe('applyPatch', () => {
  it('keeps the null state.on of a light and flips light.on (server shape)', () => {
    const next = applyPatch(lightFixture({ on: true }), { on: false })
    expect(next.state.on).toBeNull()
    expect(next.state.light?.on).toBe(false)
  })

  it('sets brightness', () => {
    expect(applyPatch(lightFixture(), { brightness: 30 }).state.light?.brightness).toBe(30)
  })

  it('switches to color mode with a color', () => {
    const light = applyPatch(lightFixture({ mode: 'white', colorTempK: 3000 }), { color: { r: 1, g: 2, b: 3 } }).state.light
    expect(light?.mode).toBe('color')
    expect(light?.color).toMatchObject({ r: 1, g: 2, b: 3 })
  })

  it('switches to white mode with a temperature', () => {
    const light = applyPatch(lightFixture(), { colorTempK: 4000 }).state.light
    expect(light).toMatchObject({ mode: 'white', colorTempK: 4000 })
  })

  it('toggles a plug without light state', () => {
    const next = applyPatch(deviceFixture({ on: true }), { on: false })
    expect(next.state).toMatchObject({ on: false, light: null })
  })

  it('keeps __typename so the cache can normalize the result', () => {
    expect(applyPatch(lightFixture(), { on: false })).toHaveProperty('__typename', 'Device')
  })
})

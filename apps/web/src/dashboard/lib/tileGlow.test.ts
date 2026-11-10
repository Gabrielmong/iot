import { deviceFixture } from '../../test/deviceFixtures'
import { ON_GLOW, tileGlow } from './tileGlow'

describe('tileGlow', () => {
  it('glows green for an on plug, TV or computer', () => {
    for (const d of [
      deviceFixture({ kind: 'PLUG', on: true }),
      deviceFixture({ kind: 'TV', brand: 'ANDROID_TV', on: true }),
      deviceFixture({ kind: 'COMPUTER', brand: 'WOL', on: true }),
    ]) expect(tileGlow(d)).toEqual({ color: ON_GLOW, strength: 0.55 })
  })

  it('does not glow when off or offline', () => {
    expect(tileGlow(deviceFixture({ kind: 'TV', brand: 'ANDROID_TV', on: false }))).toBeNull()
    expect(tileGlow(deviceFixture({ kind: 'TV', brand: 'ANDROID_TV', on: true, online: false }))).toBeNull()
  })
})

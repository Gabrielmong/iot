import { deviceFixture, lightFixture } from '../../test/deviceFixtures'
import { tileOnStyle } from './tileOnStyle'

describe('tileOnStyle', () => {
  it('is on for an online switch or plug that is on', () => {
    expect(tileOnStyle(deviceFixture({ kind: 'PLUG', on: true }))).toBe('on')
    expect(tileOnStyle(deviceFixture({ kind: 'SWITCH', on: true }))).toBe('on')
  })

  it('is off when the device is off', () => {
    expect(tileOnStyle(deviceFixture({ kind: 'PLUG', on: false }))).toBe('off')
  })

  it('is off (never green) when offline or needing setup', () => {
    expect(tileOnStyle(deviceFixture({ kind: 'PLUG', on: true, online: false }))).toBe('off')
    expect(tileOnStyle(deviceFixture({ kind: 'PLUG', on: true, status: 'NEEDS_KEY' }))).toBe('off')
  })

  it('is on for a TV or computer that is on, off when off', () => {
    expect(tileOnStyle(deviceFixture({ kind: 'TV', brand: 'ANDROID_TV', on: true }))).toBe('on')
    expect(tileOnStyle(deviceFixture({ kind: 'TV', brand: 'ANDROID_TV', on: false }))).toBe('off')
    expect(tileOnStyle(deviceFixture({ kind: 'COMPUTER', brand: 'WOL', on: true }))).toBe('on')
    expect(tileOnStyle(deviceFixture({ kind: 'COMPUTER', brand: 'WOL', on: false }))).toBe('off')
  })

  it('is null for a computer whose state is unknown (no IP)', () => {
    expect(tileOnStyle(deviceFixture({ kind: 'COMPUTER', brand: 'WOL', on: null }))).toBeNull()
  })

  it('is null for lights and cameras', () => {
    expect(tileOnStyle(lightFixture())).toBeNull()
    expect(tileOnStyle(deviceFixture({ kind: 'CAMERA' }))).toBeNull()
  })
})

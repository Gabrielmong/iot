import type { WeatherCondition } from '../../../gql/graphql'
import { rainSoon, rainSoonText } from './rainSoon'

const HOUR = 3_600_000
const now = new Date('2026-11-18T12:30:00Z')
const top = Date.parse('2026-11-18T12:00:00Z')
const hours = (over: Record<number, { condition?: WeatherCondition; rainChance?: number }> = {}) =>
  Array.from({ length: 14 }, (_, i) => ({ time: new Date(top + i * HOUR).toISOString(), condition: 'CLOUDY' as WeatherCondition, rainChance: 10, ...over[i] }))

describe('rainSoon', () => {
  it('names the first hour with a chance of 50% or more', () => {
    expect(rainSoon(hours({ 2: { rainChance: 60 }, 4: { rainChance: 90 } }), now)).toEqual({ at: new Date(top + 2 * HOUR).toISOString(), chance: 60 })
  })

  it('counts a rain, drizzle or storm hour whatever its chance', () => {
    expect(rainSoon(hours({ 3: { condition: 'RAIN', rainChance: 30 } }), now)).toEqual({ at: new Date(top + 3 * HOUR).toISOString(), chance: 30 })
  })

  it('is raining now when the hour covering now qualifies', () => {
    expect(rainSoon(hours({ 0: { condition: 'DRIZZLE' } }), now)).toBe('now')
  })

  it('looks only 12 hours ahead', () => {
    expect(rainSoon(hours({ 13: { rainChance: 80 } }), now)).toBeNull()
  })

  it('is null with no rain', () => {
    expect(rainSoon(hours(), now)).toBeNull()
  })
})

describe('rainSoonText', () => {
  it('words each case', () => {
    expect(rainSoonText('now')).toBe('Raining now')
    expect(rainSoonText(null)).toBe('No rain in the next 12 h')
    expect(rainSoonText({ at: '2026-11-18T15:00:00Z', chance: 70 })).toMatch(/^Rain likely around .+ \(70%\)$/)
  })
})

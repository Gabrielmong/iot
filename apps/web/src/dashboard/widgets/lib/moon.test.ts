import { daylightLeft, moonPhase } from './moon'

const HOUR = 3_600_000

describe('moonPhase', () => {
  it('names the main phases of November 2026', () => {
    expect(moonPhase(new Date('2026-11-09T07:00:00Z')).name).toBe('New moon')
    expect(moonPhase(new Date('2026-11-24T15:00:00Z')).name).toBe('Full moon')
  })

  it('names the phases in between', () => {
    expect(moonPhase(new Date('2026-11-13T00:00:00Z')).name).toBe('Waxing crescent')
    expect(moonPhase(new Date('2026-11-28T00:00:00Z')).name).toBe('Waning gibbous')
  })

  it('gives the lit fraction', () => {
    expect(moonPhase(new Date('2026-11-24T15:00:00Z')).fraction).toBeGreaterThan(0.95)
    expect(moonPhase(new Date('2026-11-09T07:00:00Z')).fraction).toBeLessThan(0.05)
  })
})

describe('daylightLeft', () => {
  const now = Date.parse('2026-11-18T12:00:00Z')
  const sun = (riseH: number, setH: number) => ({ sunrise: new Date(now + riseH * HOUR).toISOString(), sunset: new Date(now + setH * HOUR).toISOString() })

  it('counts down to sunset during the day', () => {
    expect(daylightLeft(sun(-6, 3 + 20 / 60), new Date(now))).toBe('3 h 20 min of daylight left')
  })

  it('counts to sunrise before dawn', () => {
    expect(daylightLeft(sun(6, 18), new Date(now))).toBe('Sunrise in 6 h')
  })

  it("counts to tomorrow's sunrise after dusk", () => {
    expect(daylightLeft(sun(-20, -2), new Date(now))).toBe('Sunrise in 4 h')
  })

  it('says nothing without sun times', () => {
    expect(daylightLeft({ sunrise: null, sunset: null }, new Date(now))).toBe('')
  })
})

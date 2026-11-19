import { daylight, sunEvents } from './sunEvents'

const sun = { sunrise: '2026-11-18T11:40:00Z', sunset: '2026-11-18T23:25:00Z' }
const at = (iso: string) => Date.parse(iso)

describe('sunEvents', () => {
  it('puts sunset next during the day', () => {
    expect(sunEvents(sun, at('2026-11-18T15:00:00Z'))).toEqual({ next: { label: 'Sunset', at: sun.sunset }, other: { label: 'Sunrise', at: sun.sunrise } })
  })

  it('puts sunrise next before dawn and after dusk', () => {
    expect(sunEvents(sun, at('2026-11-18T05:00:00Z'))?.next.label).toBe('Sunrise')
    expect(sunEvents(sun, at('2026-11-18T23:30:00Z'))?.next.label).toBe('Sunrise')
  })

  it('has nothing for a polar day or night', () => {
    expect(sunEvents({ sunrise: null, sunset: sun.sunset })).toBeNull()
  })
})

describe('daylight', () => {
  it('is the time from sunrise to sunset', () => {
    expect(daylight(sun)).toBe('11 h 45 min of daylight')
    expect(daylight({ sunrise: null, sunset: null })).toBeNull()
  })
})

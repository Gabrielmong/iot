import { formatDay, formatTemp, formatUpdated } from './format'

describe('formatTemp', () => {
  it('rounds to whole degrees', () => {
    expect(formatTemp(23.6)).toBe('24°')
    expect(formatTemp(-0.4)).toBe('0°')
    expect(formatTemp(-3.5)).toBe('-3°')
  })
})

describe('formatUpdated', () => {
  const now = Date.parse('2026-11-18T12:00:00Z')
  it('says how long ago', () => {
    expect(formatUpdated('2026-11-18T11:55:00Z', now)).toBe('Updated 5 min ago')
    expect(formatUpdated('2026-11-18T11:00:00Z', now)).toBe('Updated 1 h ago')
    expect(formatUpdated('2026-11-18T11:59:40Z', now)).toBe('Updated just now')
  })
})

describe('formatDay', () => {
  it('names today, then weekdays', () => {
    const today = new Date(2026, 10, 18)
    expect(formatDay('2026-11-18', today)).toBe('Today')
    expect(formatDay('2026-11-19', today)).toBe(new Date(2026, 10, 19).toLocaleDateString(undefined, { weekday: 'short' }))
  })
})

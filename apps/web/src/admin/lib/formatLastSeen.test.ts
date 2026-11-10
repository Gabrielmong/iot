import { formatLastSeen } from './formatLastSeen'

const now = Date.parse('2026-11-05T12:00:00Z')

describe('formatLastSeen', () => {
  it('handles never and unparseable values', () => {
    expect(formatLastSeen(null, now)).toBe('Never')
    expect(formatLastSeen('nope', now)).toBe('Never')
  })

  it('uses relative text within a day', () => {
    expect(formatLastSeen('2026-11-05T11:59:40Z', now)).toBe('Just now')
    expect(formatLastSeen('2026-11-05T11:55:00Z', now)).toBe('5 min ago')
    expect(formatLastSeen('2026-11-05T09:00:00Z', now)).toBe('3 h ago')
  })

  it('uses a date after a day', () => {
    expect(formatLastSeen('2026-11-01T09:00:00Z', now)).toBe(new Date('2026-11-01T09:00:00Z').toLocaleDateString())
  })
})

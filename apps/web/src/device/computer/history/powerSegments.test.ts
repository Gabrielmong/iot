import { powerSegments } from './powerSegments'

const t = (h: number, m = 0) => new Date(2026, 10, 17, h, m)
const ev = (on: boolean, d: Date) => ({ on, at: d.toISOString() })

describe('powerSegments', () => {
  it('is all unknown without events', () => {
    expect(powerSegments([], t(0), t(10))).toEqual([{ start: t(0), end: t(10), on: null }])
  })

  it('marks the time before the first event unknown', () => {
    expect(powerSegments([ev(true, t(4))], t(0), t(10))).toEqual([
      { start: t(0), end: t(4), on: null },
      { start: t(4), end: t(10), on: true },
    ])
  })

  it('clips an event from before the range to its start', () => {
    expect(powerSegments([ev(true, t(-5)), ev(false, t(3))], t(0), t(10))).toEqual([
      { start: t(0), end: t(3), on: true },
      { start: t(3), end: t(10), on: false },
    ])
  })

  it('splits at each event in order', () => {
    expect(powerSegments([ev(false, t(1)), ev(true, t(2)), ev(false, t(2, 30))], t(1), t(5))).toEqual([
      { start: t(1), end: t(2), on: false },
      { start: t(2), end: t(2, 30), on: true },
      { start: t(2, 30), end: t(5), on: false },
    ])
  })
})

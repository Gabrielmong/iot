import { powerSummary } from './powerSummary'

const now = new Date(2026, 10, 17, 20, 0) // a Tuesday
const ev = (on: boolean, d: Date) => ({ on, at: d.toISOString() })

describe('powerSummary', () => {
  it('says since when an on PC has been on', () => {
    expect(powerSummary([ev(false, new Date(2026, 10, 17, 9)), ev(true, new Date(2026, 10, 17, 18, 42))], { on: true }, now)).toBe('On since 18:42')
  })

  it('names the day when it came on before today', () => {
    expect(powerSummary([ev(true, new Date(2026, 10, 15, 8, 5))], { on: true }, now)).toBe('On since Sun 08:05')
  })

  it('says when an off PC was last on', () => {
    expect(powerSummary([ev(true, new Date(2026, 10, 16, 18)), ev(false, new Date(2026, 10, 16, 23, 10))], { on: false }, now)).toBe('Last on Yesterday 23:10')
    expect(powerSummary([ev(false, new Date(2026, 10, 17, 7, 30))], { on: false }, now)).toBe('Last on Today 07:30')
  })

  it('is null without events or with an unknown state', () => {
    expect(powerSummary([], { on: true }, now)).toBeNull()
    expect(powerSummary([ev(true, new Date(2026, 10, 17, 9))], { on: null }, now)).toBeNull()
  })
})

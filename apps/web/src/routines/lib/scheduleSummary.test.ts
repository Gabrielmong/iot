import { daysLabel, scheduleSummary } from './scheduleSummary'

const row = (time: string, days: number[], enabled = true) => ({ time, days, enabled })

describe('scheduleSummary', () => {
  it('names day ranges, lists and every day', () => {
    expect(daysLabel([1, 2, 3, 4, 5])).toBe('Mon–Fri')
    expect(daysLabel([6, 7])).toBe('Sat, Sun')
    expect(daysLabel([1, 2, 3, 4, 5, 6, 7])).toBe('every day')
    expect(daysLabel([1, 3, 4, 5, 7])).toBe('Mon, Wed–Fri, Sun')
  })

  it('joins enabled rows and skips disabled ones', () => {
    expect(scheduleSummary([row('07:00', [1, 2, 3, 4, 5]), row('09:30', [6, 7]), row('22:00', [1], false)])).toBe('07:00 Mon–Fri · 09:30 Sat, Sun')
    expect(scheduleSummary([row('22:00', [1, 2, 3, 4, 5, 6, 7])])).toBe('22:00 every day')
  })

  it('is empty without enabled schedules', () => {
    expect(scheduleSummary([])).toBe('')
    expect(scheduleSummary([row('07:00', [1], false)])).toBe('')
  })
})

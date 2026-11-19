import { describeConditions } from './describeCondition'

describe('describeConditions', () => {
  it('words each check like the server does', () => {
    expect(describeConditions([{ metric: 'TEMP_C', op: 'ABOVE', value: 28 }])).toBe('temperature above 28°')
    expect(describeConditions([{ metric: 'FEELS_LIKE_C', op: 'BELOW', value: -2 }])).toBe('feels like below -2°')
    expect(describeConditions([{ metric: 'HUMIDITY', op: 'ABOVE', value: 80 }])).toBe('humidity above 80%')
    expect(describeConditions([{ metric: 'WIND_KPH', op: 'BELOW', value: 10 }])).toBe('wind below 10 km/h')
    expect(describeConditions([{ metric: 'RAIN_CHANCE_TODAY', op: 'ABOVE', value: 50 }])).toBe('rain chance today above 50%')
    expect(describeConditions([{ metric: 'RAINING_NOW', op: 'IS', value: null }])).toBe('raining now')
    expect(describeConditions([{ metric: 'RAINING_NOW', op: 'IS_NOT', value: null }])).toBe('not raining now')
    expect(describeConditions([{ metric: 'SUN', op: 'IS_UP', value: null }])).toBe('the sun is up')
    expect(describeConditions([{ metric: 'SUN', op: 'IS_DOWN', value: null }])).toBe('the sun is down')
  })

  it('joins several with "and"', () => {
    expect(
      describeConditions([
        { metric: 'TEMP_C', op: 'ABOVE', value: 28 },
        { metric: 'RAINING_NOW', op: 'IS_NOT', value: null },
      ]),
    ).toBe('temperature above 28° and not raining now')
  })
})

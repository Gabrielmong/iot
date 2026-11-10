import { describeAction } from './describeAction'

const action = (over: object) => ({ deviceId: 'lamp', on: null, brightness: null, color: null, colorTempK: null, unavailable: false, ...over })

describe('describeAction', () => {
  it('summarises power, brightness, color and white temperature', () => {
    expect(describeAction(action({ on: false }))).toBe('Off')
    expect(describeAction(action({ on: true }))).toBe('On')
    expect(describeAction(action({ on: true, brightness: 20, colorTempK: 2700 }))).toBe('On · 20% · warm white')
    expect(describeAction(action({ brightness: 20 }))).toBe('20%')
    expect(describeAction(action({ on: true, color: { r: 128, g: 0, b: 128 } }))).toBe('On · Purple')
    expect(describeAction(action({ colorTempK: 6000 }))).toBe('cool white')
  })

  it('says when nothing changes', () => {
    expect(describeAction(action({}))).toBe('No change')
  })
})

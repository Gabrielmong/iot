import { checkState, initialSelection, setIds, toggleId } from './grantSelection'

describe('grantSelection', () => {
  it('toggles one id without mutating the input', () => {
    const start = new Set(['a'])
    expect([...toggleId(start, 'b')]).toEqual(['a', 'b'])
    expect([...toggleId(start, 'a')]).toEqual([])
    expect([...start]).toEqual(['a'])
  })

  it('checks or unchecks a whole room', () => {
    expect([...setIds(new Set(['z']), ['a', 'b'], true)]).toEqual(['z', 'a', 'b'])
    expect([...setIds(new Set(['z', 'a']), ['a', 'b'], false)]).toEqual(['z'])
  })

  it('reports all, some or none', () => {
    expect(checkState(new Set(['a', 'b']), ['a', 'b'])).toBe('all')
    expect(checkState(new Set(['a']), ['a', 'b'])).toBe('some')
    expect(checkState(new Set(['z']), ['a', 'b'])).toBe('none')
  })

  it('keeps only granted ids that are visible', () => {
    const groups = [{ devices: [{ id: 'a' }, { id: 'b' }] }]
    expect([...initialSelection(['a', 'strip', 'gone'], groups)]).toEqual(['a'])
  })
})

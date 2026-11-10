import { colorName, NAMED_COLORS, whiteTempName } from './colorName'

describe('colorName', () => {
  it('names the required purple', () => {
    expect(colorName({ r: 155, g: 89, b: 255 })).toBe('Purple')
  })

  it('has a fixed palette of 12 names, each naming its own value', () => {
    expect(NAMED_COLORS).toHaveLength(12)
    for (const c of NAMED_COLORS) expect(colorName(c.rgb)).toBe(c.name)
  })

  it.each([
    [{ r: 250, g: 10, b: 5 }, 'Red'],
    [{ r: 255, g: 140, b: 20 }, 'Orange'],
    [{ r: 10, g: 40, b: 240 }, 'Blue'],
    [{ r: 250, g: 250, b: 245 }, 'White'],
  ])('picks the nearest name for %o', (rgb, name) => {
    expect(colorName(rgb)).toBe(name)
  })
})

describe('whiteTempName', () => {
  it.each([
    [2700, 'Warm'],
    [3500, 'Warm'],
    [3501, 'Neutral'],
    [5000, 'Neutral'],
    [5001, 'Cool'],
    [6500, 'Cool'],
  ])('%i K is %s', (k, name) => {
    expect(whiteTempName(k)).toBe(name)
  })
})

import { hueToRgb, rgbToHue } from './hue'

describe('hue', () => {
  it.each([
    [0, { r: 255, g: 0, b: 0 }],
    [120, { r: 0, g: 255, b: 0 }],
    [240, { r: 0, g: 0, b: 255 }],
    [300, { r: 255, g: 0, b: 255 }],
  ])('hue %i is %o', (hue, rgb) => {
    expect(hueToRgb(hue)).toEqual(rgb)
    expect(rgbToHue(rgb)).toBe(hue)
  })

  it('treats greys as hue 0', () => {
    expect(rgbToHue({ r: 9, g: 9, b: 9 })).toBe(0)
  })
})

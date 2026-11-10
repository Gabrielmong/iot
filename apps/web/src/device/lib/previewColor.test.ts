import { previewColor } from './previewColor'

describe('previewColor', () => {
  it('scales the colour by brightness in colour mode', () => {
    expect(previewColor({ on: true, light: { mode: 'color', color: { r: 155, g: 89, b: 255 }, brightness: 70 } })).toEqual({
      css: 'rgb(109, 62, 179)',
      glow: 0.7,
    })
  })

  it('uses the white-temperature tint scaled by brightness in white mode', () => {
    expect(previewColor({ on: true, light: { mode: 'white', color: null, colorTempK: 2700, brightness: 50 } })).toEqual({
      css: 'rgb(128, 85, 44)',
      glow: 0.5,
    })
  })

  it('reads on from light.on when state.on is null (lights)', () => {
    const light = { on: true, mode: 'color', color: { r: 255, g: 0, b: 0 }, colorTempK: null, brightness: 100 }
    expect(previewColor({ on: null, light })).toEqual({ css: 'rgb(255, 0, 0)', glow: 1 })
  })

  it('is dark with no glow when off', () => {
    const light = { on: false, mode: 'color', color: { r: 155, g: 89, b: 255 }, colorTempK: null, brightness: 70 }
    expect(previewColor({ on: null, light })).toEqual({ css: '#3a3f4b', glow: 0 })
  })
})

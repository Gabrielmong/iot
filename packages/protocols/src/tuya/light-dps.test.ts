import { describe, expect, it } from 'vitest';
import { dpsToLightState, lightPatchToDps } from './light-dps.js';
import { V1_LIGHT_SCHEMA, V2_LIGHT_SCHEMA } from './light-schema.js';

const v2 = V2_LIGHT_SCHEMA;
const v1 = V1_LIGHT_SCHEMA;

describe('light schemas', () => {
  it('match the default v2 and v1 DP layouts', () => {
    expect(v2).toEqual({
      switch: '20', mode: '21', brightness: '22', colorTemp: '23', color: '24',
      brightnessRange: [10, 1000], colorFormat: 'hsv12',
    });
    expect(v1).toEqual({
      switch: '1', mode: '2', brightness: '3', colorTemp: '4', color: '5',
      brightnessRange: [25, 255], colorFormat: 'rgbhsv14',
    });
  });
});

describe('dpsToLightState', () => {
  it('decodes a full-brightness red v2 colour state', () => {
    // Tuya hsv12 is hhhh ssss vvvv: hue 0 (red), saturation 1000, value 1000.
    expect(dpsToLightState({ '20': true, '21': 'colour', '22': 1000, '24': '000003e803e8' }, v2)).toEqual({
      on: true, brightness: 100, mode: 'color', color: { r: 255, g: 0, b: 0 },
    });
  });

  it('reads hue 0x00f0 (240 degrees) as blue', () => {
    expect(dpsToLightState({ '20': true, '21': 'colour', '22': 1000, '24': '00f003e803e8' }, v2).color).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('takes colour-mode brightness from the HSV value, not the white brightness DP', () => {
    // v = 505 on the [10,1000] range is 50%.
    expect(dpsToLightState({ '20': true, '21': 'colour', '22': 1000, '24': '007803e801f9' }, v2)).toEqual({
      on: true, brightness: 50, mode: 'color', color: { r: 0, g: 255, b: 0 },
    });
  });

  it('decodes a v2 white state with colour temperature', () => {
    expect(dpsToLightState({ '20': false, '21': 'white', '22': 10, '23': 1000 }, v2)).toEqual({
      on: false, brightness: 0, mode: 'white', colorTempK: 6500,
    });
  });

  it('decodes a v1 rgbhsv14 colour state', () => {
    // rrggbb, then hhhh ss vv (s and v out of 255).
    expect(dpsToLightState({ '1': true, '2': 'colour', '3': 255, '5': '0000ff00f0ffff' }, v1)).toEqual({
      on: true, brightness: 100, mode: 'color', color: { r: 0, g: 0, b: 255 },
    });
  });

  it('decodes a v1 white state', () => {
    expect(dpsToLightState({ '1': true, '2': 'white', '3': 25, '4': 0 }, v1)).toEqual({
      on: true, brightness: 0, mode: 'white', colorTempK: 2700,
    });
  });

  it('treats scene and music modes as colour', () => {
    expect(dpsToLightState({ '20': true, '21': 'scene', '22': 1000 }, v2).mode).toBe('color');
  });

  it('defaults missing DPs to off, zero brightness and white', () => {
    expect(dpsToLightState({}, v2)).toEqual({ on: false, brightness: 0, mode: 'white' });
  });
});

describe('lightPatchToDps', () => {
  it('maps brightness onto the brightness range', () => {
    expect(lightPatchToDps({ brightness: 50 }, v2)).toEqual({ '22': 505 });
    expect(lightPatchToDps({ brightness: 0 }, v2)).toEqual({ '22': 10 });
    expect(lightPatchToDps({ brightness: 100 }, v1)).toEqual({ '3': 255 });
  });

  it('switches to white mode for a colour temperature', () => {
    expect(lightPatchToDps({ colorTempK: 2700 }, v2)).toEqual({ '21': 'white', '23': 0 });
    expect(lightPatchToDps({ colorTempK: 6500 }, v2)).toEqual({ '21': 'white', '23': 1000 });
    expect(lightPatchToDps({ colorTempK: 4600 }, v1)).toEqual({ '2': 'white', '4': 128 });
  });

  it('clamps colour temperature to 2700-6500 K', () => {
    expect(lightPatchToDps({ colorTempK: 2000 }, v2)).toEqual({ '21': 'white', '23': 0 });
    expect(lightPatchToDps({ colorTempK: 9000 }, v2)).toEqual({ '21': 'white', '23': 1000 });
  });

  it('maps on/off to the switch DP', () => {
    expect(lightPatchToDps({ on: false }, v2)).toEqual({ '20': false });
  });

  it('encodes a colour in colour mode, taking the value from the colour itself', () => {
    expect(lightPatchToDps({ color: { r: 255, g: 0, b: 0 } }, v2)).toEqual({ '21': 'colour', '24': '000003e803e8' });
  });

  it('encodes colour and brightness together into the HSV value', () => {
    expect(lightPatchToDps({ color: { r: 0, g: 255, b: 0 }, brightness: 50 }, v2)).toEqual({
      '21': 'colour', '24': '007803e801f9',
    });
  });

  it('encodes a v1 colour as rgbhsv14', () => {
    expect(lightPatchToDps({ color: { r: 0, g: 0, b: 255 } }, v1)).toEqual({ '2': 'colour', '5': '0000ff00f0ffff' });
  });

  it('lets colour win over colour temperature', () => {
    expect(lightPatchToDps({ color: { r: 255, g: 0, b: 0 }, colorTempK: 3000 }, v2)).toEqual({
      '21': 'colour', '24': '000003e803e8',
    });
  });

  it('dims a light that is in colour mode through the HSV value when the current state is given', () => {
    const current = { on: true, brightness: 100, mode: 'color' as const, color: { r: 255, g: 0, b: 0 } };
    expect(lightPatchToDps({ brightness: 50 }, v2, current)).toEqual({ '24': '000003e801f9' });
  });

  it('skips DPs the schema does not have', () => {
    const switchOnly = { switch: '1', brightnessRange: [10, 1000] as [number, number], colorFormat: 'hsv12' as const };
    expect(lightPatchToDps({ on: true, brightness: 50, colorTempK: 3000, color: { r: 1, g: 2, b: 3 } }, switchOnly)).toEqual({ '1': true });
  });
});

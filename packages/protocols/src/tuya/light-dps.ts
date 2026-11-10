import { hsvToRgb, rgbToHsv } from '../color.js';
import type { LightPatch, LightState, Rgb } from '../types.js';
import { decodeColor, encodeColor, FORMAT_SCALE } from './light-color-format.js';
import type { DpSchema } from './light-schema.js';
import { kelvinToRaw, percentToRaw, rawToKelvin, rawToPercent } from './light-scale.js';

export type { DpSchema } from './light-schema.js';

const TUYA_COLOUR = 'colour';
const TUYA_WHITE = 'white';

/** Reads a light's state from its dps. Any mode other than "white" (colour, scene, music) counts as colour. */
export function dpsToLightState(dps: Record<string, unknown>, schema: DpSchema): LightState {
  const on = dps[schema.switch] === true;
  const rawMode = schema.mode === undefined ? undefined : dps[schema.mode];
  const isColor = rawMode !== undefined && rawMode !== TUYA_WHITE;
  const rawColor = isColor && schema.color ? decodeColor(schema.colorFormat, dps[schema.color]) : undefined;

  if (rawColor) {
    const color = hsvToRgb({ h: rawColor.h, s: rawColor.s / FORMAT_SCALE[schema.colorFormat].sat, v: 1 });
    return { on, brightness: rawToPercent(rawColor.v, schema.brightnessRange), mode: 'color', color };
  }

  const rawBrightness = schema.brightness === undefined ? undefined : dps[schema.brightness];
  const state: LightState = {
    on,
    brightness: typeof rawBrightness === 'number' ? rawToPercent(rawBrightness, schema.brightnessRange) : 0,
    mode: isColor ? 'color' : 'white',
  };
  const rawTemp = schema.colorTemp === undefined ? undefined : dps[schema.colorTemp];
  if (!isColor && typeof rawTemp === 'number') state.colorTempK = rawToKelvin(rawTemp, FORMAT_SCALE[schema.colorFormat].temp);
  return state;
}

/**
 * Builds the dps for a light change. `color` wins over `colorTempK`. Brightness goes into the colour
 * DP's value when a colour is set, or when `current` says the light is in colour mode (setting the
 * white-brightness DP there would switch some bulbs to white); otherwise into the brightness DP.
 * DPs the schema lacks are skipped.
 */
export function lightPatchToDps(patch: LightPatch, schema: DpSchema, current?: LightState): Record<string, unknown> {
  const dps: Record<string, unknown> = {};
  const setMode = (mode: string) => {
    if (schema.mode) dps[schema.mode] = mode;
  };
  if (patch.on !== undefined) dps[schema.switch] = patch.on;

  if (patch.color && schema.color) {
    setMode(TUYA_COLOUR);
    dps[schema.color] = colorDp(patch.color, patch.brightness, schema);
    return dps;
  }
  if (patch.colorTempK !== undefined && schema.colorTemp) {
    setMode(TUYA_WHITE);
    dps[schema.colorTemp] = kelvinToRaw(patch.colorTempK, FORMAT_SCALE[schema.colorFormat].temp);
  } else if (patch.brightness !== undefined && current?.mode === 'color' && current.color && schema.color) {
    dps[schema.color] = colorDp(current.color, patch.brightness, schema);
    return dps;
  }
  if (patch.brightness !== undefined && schema.brightness) {
    dps[schema.brightness] = percentToRaw(patch.brightness, schema.brightnessRange);
  }
  return dps;
}

/** Encodes `rgb` as the schema's colour DP, at `brightness` percent or, if absent, the colour's own value. */
function colorDp(rgb: Rgb, brightness: number | undefined, schema: DpSchema): string {
  const hsv = rgbToHsv(rgb);
  const percent = brightness ?? hsv.v * 100;
  const raw = {
    h: Math.round(hsv.h) % 360,
    s: Math.round(hsv.s * FORMAT_SCALE[schema.colorFormat].sat),
    v: percentToRaw(percent, schema.brightnessRange),
  };
  return encodeColor(schema.colorFormat, raw, percent / 100);
}

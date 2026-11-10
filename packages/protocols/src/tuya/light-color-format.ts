import { hsvToRgb } from '../color.js';
import type { DpSchema } from './light-schema.js';

/** Hue in degrees; saturation and value in the format's raw units. */
export type RawHsv = { h: number; s: number; v: number };

type ColorFormat = DpSchema['colorFormat'];

/** Raw maxima per format: saturation, and colour temperature (which shares the format's generation). */
export const FORMAT_SCALE: Record<ColorFormat, { sat: number; temp: number }> = {
  hsv12: { sat: 1000, temp: 1000 },
  rgbhsv14: { sat: 255, temp: 255 },
};

const hex = (n: number, digits: number) => Math.round(n).toString(16).padStart(digits, '0');

/**
 * Encodes a colour DP. hsv12 is `hhhh ssss vvvv`; rgbhsv14 is `rrggbb hhhh ss vv`, whose RGB
 * prefix is the colour at the given value (`vFraction`, 0-1).
 */
export function encodeColor(format: ColorFormat, raw: RawHsv, vFraction: number): string {
  const hsv = hex(raw.h % 360, 4) + hex(raw.s, format === 'hsv12' ? 4 : 2) + hex(raw.v, format === 'hsv12' ? 4 : 2);
  if (format === 'hsv12') return hsv;
  const { r, g, b } = hsvToRgb({ h: raw.h, s: raw.s / FORMAT_SCALE.rgbhsv14.sat, v: vFraction });
  return hex(r, 2) + hex(g, 2) + hex(b, 2) + hsv;
}

/** Decodes a colour DP, or returns undefined if it is not in the expected format. */
export function decodeColor(format: ColorFormat, value: unknown): RawHsv | undefined {
  const length = format === 'hsv12' ? 12 : 14;
  if (typeof value !== 'string' || value.length !== length || !/^[0-9a-f]+$/i.test(value)) return undefined;
  const hsv = format === 'hsv12' ? value : value.slice(6);
  const sv = format === 'hsv12' ? 4 : 2;
  return {
    h: parseInt(hsv.slice(0, 4), 16),
    s: parseInt(hsv.slice(4, 4 + sv), 16),
    v: parseInt(hsv.slice(4 + sv, 4 + 2 * sv), 16),
  };
}

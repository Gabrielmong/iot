/** Conversions between normalized light values and a Tuya device's raw DP units. */

export const MIN_KELVIN = 2700;
export const MAX_KELVIN = 6500;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Raw brightness on `[min, max]` to a 0-100 percentage. */
export function rawToPercent(raw: number, [min, max]: [number, number]): number {
  return clamp(Math.round(((raw - min) / (max - min)) * 100), 0, 100);
}

/** A 0-100 percentage to raw brightness on `[min, max]`. */
export function percentToRaw(percent: number, [min, max]: [number, number]): number {
  return Math.round(min + (clamp(percent, 0, 100) / 100) * (max - min));
}

/** Raw colour temperature on `[0, rawMax]` (warm to cool) to Kelvin. */
export function rawToKelvin(raw: number, rawMax: number): number {
  return Math.round(MIN_KELVIN + (clamp(raw, 0, rawMax) / rawMax) * (MAX_KELVIN - MIN_KELVIN));
}

/** Kelvin (clamped to 2700-6500 K) to raw colour temperature on `[0, rawMax]`. */
export function kelvinToRaw(kelvin: number, rawMax: number): number {
  return Math.round(((clamp(kelvin, MIN_KELVIN, MAX_KELVIN) - MIN_KELVIN) / (MAX_KELVIN - MIN_KELVIN)) * rawMax);
}

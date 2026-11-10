import { badInput } from "../api-errors.js";
import type { StatePatch } from "../devices/types.js";

export type StatePatchInput = {
  on?: boolean | null;
  brightness?: number | null;
  color?: { r: number; g: number; b: number } | null;
  colorTempK?: number | null;
};

const inRange = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

/** Validates a requested change: brightness 0-100, RGB 0-255, colour temperature 1000-10000 K. */
export function parseStatePatch(input: StatePatchInput): StatePatch {
  const patch: StatePatch = {};
  if (input.on != null) patch.on = input.on;
  if (input.brightness != null) {
    if (!inRange(input.brightness, 0, 100)) throw badInput("brightness must be 0-100");
    patch.brightness = input.brightness;
  }
  if (input.color != null) {
    const { r, g, b } = input.color;
    if (![r, g, b].every((c) => inRange(c, 0, 255))) throw badInput("color channels must be 0-255");
    patch.color = { r, g, b };
  }
  if (input.colorTempK != null) {
    if (!inRange(input.colorTempK, 1000, 10000)) throw badInput("colorTempK must be 1000-10000");
    patch.colorTempK = input.colorTempK;
  }
  if (Object.keys(patch).length === 0) throw badInput("Nothing to change");
  return patch;
}

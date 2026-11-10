import type { DpSchema } from './light-schema.js';

/** One entry of a Tuya device specification's `functions` / `status` lists. */
export type CloudSpecEntry = { code: string; dp_id: number; values?: string };

const V2_RANGE: [number, number] = [10, 1000];
const V1_RANGE: [number, number] = [25, 255];

/** Reads `{"min":..,"max":..}` from a spec entry's `values`, falling back to `fallback`. */
function rangeOf(entry: CloudSpecEntry | undefined, fallback: [number, number]): [number, number] {
  if (!entry?.values) return fallback;
  try {
    const { min, max } = JSON.parse(entry.values) as { min?: unknown; max?: unknown };
    return typeof min === 'number' && typeof max === 'number' ? [min, max] : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Derives the light DP layout from the spec's code to dp_id mapping. Returns undefined for devices
 * without a `switch_led` code (plugs, sensors). The `_v2` codes mean the newer 10-1000 / hsv12
 * layout; the plain codes the older 25-255 / rgbhsv14 one.
 */
export function deriveDpSchema(entries: readonly CloudSpecEntry[]): DpSchema | undefined {
  const byCode = new Map(entries.map((e) => [e.code, e]));
  const id = (...codes: string[]): string | undefined => {
    for (const code of codes) {
      const hit = byCode.get(code);
      if (hit) return String(hit.dp_id);
    }
    return undefined;
  };
  const switchDp = id('switch_led');
  if (!switchDp) return undefined;

  const v2Brightness = byCode.get('bright_value_v2');
  const isV2 = byCode.has('colour_data_v2') || v2Brightness !== undefined;
  const schema: DpSchema = {
    switch: switchDp,
    brightnessRange: rangeOf(v2Brightness ?? byCode.get('bright_value'), isV2 ? V2_RANGE : V1_RANGE),
    colorFormat: isV2 ? 'hsv12' : 'rgbhsv14',
  };
  const mode = id('work_mode');
  const brightness = id('bright_value_v2', 'bright_value');
  const colorTemp = id('temp_value_v2', 'temp_value');
  const color = id('colour_data_v2', 'colour_data');
  if (mode) schema.mode = mode;
  if (brightness) schema.brightness = brightness;
  if (colorTemp) schema.colorTemp = colorTemp;
  if (color) schema.color = color;
  return schema;
}

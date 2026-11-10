/** The camera codes the app can control (zoom and diagonals were left out after testing a real camera). */
export const CAMERA_CONTROL_CODES = [
  'ptz_control',
  'ptz_stop',
  'ipc_preset_set',
  'ipc_preset_action',
  'basic_nightvision',
  'basic_private',
  'basic_flip',
  'motion_tracking',
  'basic_osd',
  'basic_indicator',
  'motion_switch',
  'basic_wdr',
] as const;
export type CameraControlCode = (typeof CAMERA_CONTROL_CODES)[number];

export type CameraFeatureSpec = { type: 'bool' } | { type: 'enum'; range: string[] };
/** The controllable codes a camera reports, with their value types. */
export type CameraFeatures = Partial<Record<CameraControlCode, CameraFeatureSpec>>;

/** Tuya categories whose thing model is read for camera features. */
export const CAMERA_CATEGORIES: ReadonlySet<string> = new Set(['sp', 'cdsxj']);

type ThingProperty = { code: string; accessMode?: string; typeSpec?: { type?: string; range?: unknown } };
/** The parsed `model` of `/v2.0/cloud/thing/{id}/model`. */
export type ThingModel = { services?: { properties?: ThingProperty[] }[] };

const CATALOG: ReadonlySet<string> = new Set(CAMERA_CONTROL_CODES);

function specOf(p: ThingProperty): CameraFeatureSpec | undefined {
  if (p.typeSpec?.type === 'bool') return { type: 'bool' };
  const range = p.typeSpec?.range;
  if (p.typeSpec?.type === 'enum' && Array.isArray(range) && range.every((v) => typeof v === 'string')) return { type: 'enum', range };
  return undefined;
}

/** The writable catalog codes in a thing model; undefined when there are none. */
export function deriveCameraFeatures(model: ThingModel): CameraFeatures | undefined {
  const features: CameraFeatures = {};
  for (const service of model.services ?? []) {
    for (const p of service.properties ?? []) {
      if (!CATALOG.has(p.code) || !p.accessMode?.includes('w')) continue;
      const spec = specOf(p);
      if (spec) features[p.code as CameraControlCode] = spec;
    }
  }
  return Object.keys(features).length > 0 ? features : undefined;
}

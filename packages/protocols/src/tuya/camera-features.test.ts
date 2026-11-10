import { describe, expect, it } from 'vitest';
import { deriveCameraFeatures, type ThingModel } from './camera-features.js';

const prop = (code: string, typeSpec: Record<string, unknown>, accessMode = 'rw') => ({ code, accessMode, typeSpec });
const model = (...properties: ReturnType<typeof prop>[]): ThingModel => ({ services: [{ properties }] });

describe('deriveCameraFeatures', () => {
  it('keeps only catalog codes', () => {
    const features = deriveCameraFeatures(
      model(
        prop('ptz_control', { type: 'enum', range: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] }),
        prop('ptz_stop', { type: 'bool' }),
        prop('basic_nightvision', { type: 'enum', range: ['0', '1', '2'] }),
        prop('siren_switch', { type: 'bool' }),
        prop('sd_format', { type: 'bool' }),
        prop('zoom_control', { type: 'enum', range: ['0', '1'] }),
      ),
    );
    expect(features).toEqual({
      ptz_control: { type: 'enum', range: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] },
      ptz_stop: { type: 'bool' },
      basic_nightvision: { type: 'enum', range: ['0', '1', '2'] },
    });
  });

  it('ignores read-only codes', () => {
    expect(deriveCameraFeatures(model(prop('basic_flip', { type: 'bool' }, 'ro'), prop('basic_osd', { type: 'bool' })))).toEqual({
      basic_osd: { type: 'bool' },
    });
  });

  it('accepts write-read access modes', () => {
    expect(deriveCameraFeatures(model(prop('ipc_preset_action', { type: 'enum', range: ['1', '2'] }, 'wr')))).toEqual({
      ipc_preset_action: { type: 'enum', range: ['1', '2'] },
    });
  });

  it('skips an enum without a range and an unknown type', () => {
    expect(deriveCameraFeatures(model(prop('basic_nightvision', { type: 'enum' }), prop('basic_flip', { type: 'value' })))).toBeUndefined();
  });

  it('returns undefined for a model with no catalog codes', () => {
    expect(deriveCameraFeatures(model(prop('siren_switch', { type: 'bool' })))).toBeUndefined();
    expect(deriveCameraFeatures({})).toBeUndefined();
  });
});

import type { CameraControlsFieldsFragment } from '../gql/graphql'

type Settings = NonNullable<CameraControlsFieldsFragment['settings']>

/**
 * A pan/tilt camera with presets (slot 1 saved), night vision, flip, follow motion and timestamp,
 * as the server returns it (with `__typename`s so the Apollo cache can match the fragment).
 */
export function cameraControlsFixture(over: Partial<CameraControlsFieldsFragment> = {}): CameraControlsFieldsFragment {
  const settings: Settings | null = over.settings === undefined ? defaultSettings : over.settings
  const fixture = {
    __typename: 'CameraControls',
    deviceId: 'cam1',
    pan: true,
    presets: [1, 2, 3, 4].map((slot) => ({ __typename: 'PresetSlot', slot, saved: slot === 1 })),
    supported: ['nightVision', 'flip', 'followMotion', 'timestamp'],
    ...over,
    settings: settings && { __typename: 'CameraSettings', ...settings },
  }
  return fixture as CameraControlsFieldsFragment
}

const defaultSettings: Settings = {
  nightVision: 'AUTO',
  privacy: false,
  flip: false,
  followMotion: false,
  timestamp: true,
  statusLight: null,
  motionDetection: null,
  wdr: null,
}

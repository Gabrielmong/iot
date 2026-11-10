/** Android keycodes for the remote's buttons. */
export const ANDROID_KEYCODES = {
  POWER: 26,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  MUTE: 164,
  UP: 19,
  DOWN: 20,
  LEFT: 21,
  RIGHT: 22,
  OK: 23,
  BACK: 4,
  HOME: 3,
} as const;

export type AndroidKeyName = keyof typeof ANDROID_KEYCODES;

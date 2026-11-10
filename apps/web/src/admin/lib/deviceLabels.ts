export const KIND_LABELS = {
  LIGHT: 'Light',
  SWITCH: 'Switch',
  PLUG: 'Plug',
  CAMERA: 'Camera',
  TV: 'TV',
  COMPUTER: 'Computer',
  UNKNOWN: 'Unknown',
} as const

export const BRAND_LABELS = { TUYA: 'Tuya', KASA: 'Kasa', GOVEE: 'Govee', SWANN: 'Swann', ANDROID_TV: 'Android TV', SAMSUNG: 'Samsung', HISENSE: 'Hisense', WOL: 'Wake-on-LAN' } as const

export const STATUS_LABELS = {
  OK: 'OK',
  KEY_INVALID: 'Key invalid',
  NEEDS_KEY: 'Needs key',
  NEEDS_CREDENTIALS: 'Needs login',
  NEEDS_PAIRING: 'Needs pairing',
} as const

export const STATUS_COLORS = {
  OK: 'success',
  KEY_INVALID: 'error',
  NEEDS_KEY: 'warning',
  NEEDS_CREDENTIALS: 'warning',
  NEEDS_PAIRING: 'warning',
} as const

/** "14 devices updated" / "1 device updated". */
export const syncSummary = (matched: number): string => `${matched} ${matched === 1 ? 'device' : 'devices'} updated`

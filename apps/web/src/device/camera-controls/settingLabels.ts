import type { CameraSettingsInput, NightVision } from '../../gql/graphql'

export type BoolSetting = Exclude<keyof CameraSettingsInput, 'nightVision'>

export const SETTING_LABELS: Record<BoolSetting, string> = {
  privacy: 'Privacy',
  flip: 'Flip image',
  followMotion: 'Follow motion',
  timestamp: 'Timestamp on video',
  statusLight: 'Status light',
  motionDetection: 'Motion detection',
  wdr: 'WDR',
}

/** Toggles shown as chips; the rest go under "More…". */
export const CHIP_SETTINGS: BoolSetting[] = ['privacy', 'flip', 'followMotion']
export const MORE_SETTINGS: BoolSetting[] = ['timestamp', 'statusLight', 'motionDetection', 'wdr']

export const NIGHT_VISION_LABELS: Record<NightVision, string> = { AUTO: 'Auto', ON: 'On', OFF: 'Off' }
export const NIGHT_VISION_ORDER: NightVision[] = ['AUTO', 'ON', 'OFF']

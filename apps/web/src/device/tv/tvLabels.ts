import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import VolumeDownIcon from '@mui/icons-material/VolumeDown'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import type { SvgIconComponent } from '@mui/icons-material'
import type { TvApp, TvKey } from '../../gql/graphql'

type KeyLook = { label: string; Icon: SvgIconComponent | null }

/** Accessible label and icon (OK is a text button) for each remote key. */
export const TV_KEYS: Record<TvKey, KeyLook> = {
  POWER: { label: 'Power', Icon: PowerSettingsNewIcon },
  VOLUME_UP: { label: 'Volume up', Icon: VolumeUpIcon },
  VOLUME_DOWN: { label: 'Volume down', Icon: VolumeDownIcon },
  MUTE: { label: 'Mute', Icon: VolumeOffIcon },
  UP: { label: 'Up', Icon: KeyboardArrowUpIcon },
  DOWN: { label: 'Down', Icon: KeyboardArrowDownIcon },
  LEFT: { label: 'Left', Icon: KeyboardArrowLeftIcon },
  RIGHT: { label: 'Right', Icon: KeyboardArrowRightIcon },
  OK: { label: 'OK', Icon: null },
  BACK: { label: 'Back', Icon: ArrowBackIcon },
  HOME: { label: 'Home', Icon: HomeOutlinedIcon },
}

/** Keys that repeat while held. */
export const REPEATING_KEYS = new Set<TvKey>(['VOLUME_UP', 'VOLUME_DOWN', 'UP', 'DOWN', 'LEFT', 'RIGHT'])

/** App shortcut names and brand-ish accent colors. */
export const TV_APPS: Record<TvApp, { label: string; color: string }> = {
  YOUTUBE: { label: 'YouTube', color: '#ff0033' },
  NETFLIX: { label: 'Netflix', color: '#e50914' },
  PRIME_VIDEO: { label: 'Prime Video', color: '#1399ff' },
  DISNEY_PLUS: { label: 'Disney+', color: '#113ccf' },
  SPOTIFY: { label: 'Spotify', color: '#1db954' },
}

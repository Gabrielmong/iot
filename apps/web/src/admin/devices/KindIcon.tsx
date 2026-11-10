import QuestionMarkIcon from '@mui/icons-material/QuestionMark'
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined'
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined'
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import TvOutlinedIcon from '@mui/icons-material/TvOutlined'
import ComputerOutlinedIcon from '@mui/icons-material/ComputerOutlined'
import Box from '@mui/material/Box'
import type { AdminDevice } from '../types'

const ICONS = {
  LIGHT: LightbulbOutlinedIcon,
  SWITCH: ToggleOnOutlinedIcon,
  PLUG: PowerOutlinedIcon,
  CAMERA: VideocamOutlinedIcon,
  TV: TvOutlinedIcon,
  COMPUTER: ComputerOutlinedIcon,
  UNKNOWN: QuestionMarkIcon,
} as const

/** A device kind's icon in a small rounded tile. Decorative: the kind is also written out nearby. */
export function KindIcon({ kind }: { kind: AdminDevice['kind'] }) {
  const Icon = ICONS[kind]
  return (
    <Box
      aria-hidden
      sx={{ width: 34, height: 34, borderRadius: '8px', bgcolor: 'action.hover', color: 'text.secondary', display: 'grid', placeItems: 'center', flexShrink: 0 }}
    >
      <Icon fontSize="small" />
    </Box>
  )
}

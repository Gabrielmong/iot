import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import Box from '@mui/material/Box'
import type { PanDirection } from '../../gql/graphql'
import { DirectionButton } from './DirectionButton'

type Props = { onMove: (d: PanDirection) => void; onStop: () => void }

const ARROWS = [
  { direction: 'UP', label: 'Move up', icon: <KeyboardArrowUpIcon />, area: 'up' },
  { direction: 'LEFT', label: 'Move left', icon: <KeyboardArrowLeftIcon />, area: 'left' },
  { direction: 'RIGHT', label: 'Move right', icon: <KeyboardArrowRightIcon />, area: 'right' },
  { direction: 'DOWN', label: 'Move down', icon: <KeyboardArrowDownIcon />, area: 'down' },
] as const

/** Up/down/left/right arrows in a cross. */
export function DirectionPad({ onMove, onStop }: Props) {
  return (
    <Box sx={{ display: 'grid', gridTemplateAreas: '". up ." "left . right" ". down ."', gridTemplateColumns: 'repeat(3, 44px)', gap: 0.5 }}>
      {ARROWS.map((a) => (
        <Box key={a.direction} sx={{ gridArea: a.area }}>
          <DirectionButton direction={a.direction as PanDirection} label={a.label} icon={a.icon} onMove={onMove} onStop={onStop} />
        </Box>
      ))}
    </Box>
  )
}

import IconButton from '@mui/material/IconButton'
import type { ReactNode } from 'react'
import type { PanDirection } from '../../gql/graphql'
import { overlayButton } from './overlayButton'
import { REPEAT_MS } from './timing'
import { useHoldAction } from './useHoldAction'

type Props = { direction: PanDirection; label: string; icon: ReactNode; onMove: (d: PanDirection) => void; onStop: () => void }

/** One arrow: hold to move, release to stop. */
export function DirectionButton({ direction, label, icon, onMove, onStop }: Props) {
  const hold = useHoldAction({ start: () => onMove(direction), stop: onStop, repeatMs: REPEAT_MS })
  return (
    <IconButton aria-label={label} {...hold} onContextMenu={(e) => e.preventDefault()} sx={overlayButton}>
      {icon}
    </IconButton>
  )
}

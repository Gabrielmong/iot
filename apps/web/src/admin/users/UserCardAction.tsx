import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import type { ReactNode } from 'react'

type Props = { label: string; title: string; icon: ReactNode; onClick: () => void }

/** An icon button in a user card's action bar, with a short tooltip and a full accessible name. */
export function UserCardAction({ label, title, icon, onClick }: Props) {
  return (
    <Tooltip title={title}>
      <IconButton aria-label={label} onClick={onClick} size="large">
        {icon}
      </IconButton>
    </Tooltip>
  )
}

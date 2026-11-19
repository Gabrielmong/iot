import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState } from 'react'
import { STEP_TITLE } from '../lib/stepTitle'

type Props = { onAdd: (kind: 'CONTINUE_IF' | 'IF') => void }

/** "Add weather check": an Only-continue-if step or an If step. */
export function AddCheckButton({ onAdd }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const pick = (kind: 'CONTINUE_IF' | 'IF') => {
    setAnchor(null)
    onAdd(kind)
  }
  return (
    <>
      <Button variant="outlined" startIcon={<WbSunnyOutlinedIcon />} onClick={(e) => setAnchor(e.currentTarget)}>
        Add weather check
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => pick('CONTINUE_IF')}>{STEP_TITLE.CONTINUE_IF}</MenuItem>
        <MenuItem onClick={() => pick('IF')}>If… then run…</MenuItem>
      </Menu>
    </>
  )
}

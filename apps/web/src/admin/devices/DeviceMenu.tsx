import MoreVertIcon from '@mui/icons-material/MoreVert'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState } from 'react'
import type { AdminDevice } from '../types'

export type DeviceAction = 'edit' | 'key' | 'pair' | 'computer' | 'remove'

type Props = { device: AdminDevice; onAction: (action: DeviceAction) => void }

/** The per-device "..." menu: rename / move, Tuya local key, Pair (TVs), Edit MAC / IP (computers), remove. */
export function DeviceMenu({ device, onAction }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const pick = (action: DeviceAction) => {
    setAnchor(null)
    onAction(action)
  }
  return (
    <>
      <IconButton aria-label={`Options for ${device.name}`} onClick={(e) => setAnchor(e.currentTarget)} size="large">
        <MoreVertIcon />
      </IconButton>
      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => pick('edit')}>Rename / move room</MenuItem>
        {device.brand === 'TUYA' && <MenuItem onClick={() => pick('key')}>Set Tuya local key</MenuItem>}
        {device.kind === 'TV' && <MenuItem onClick={() => pick('pair')}>Pair</MenuItem>}
        {device.brand === 'WOL' && <MenuItem onClick={() => pick('computer')}>Edit MAC / IP</MenuItem>}
        <MenuItem onClick={() => pick('remove')}>Remove</MenuItem>
      </Menu>
    </>
  )
}

import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined'
import WifiOutlinedIcon from '@mui/icons-material/WifiOutlined'
import ButtonBase from '@mui/material/ButtonBase'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import type { TileSize } from '../lib/tileSize'
import type { Device } from '../types'
import { offlineDevices, offlineText } from './lib/offlineDevices'
import { OfflineDialog } from './OfflineDialog'

const NAMES_SHOWN = 3

/** How many devices aren't responding, house-wide; tapping lists them. Bigger cards name the first few. */
export function OfflineWidget({ devices, size }: { devices: readonly Device[]; size: TileSize }) {
  const [open, setOpen] = useState(false)
  const offline = offlineDevices(devices)
  const text = offlineText(offline.length)
  const content = (
    <Stack spacing={0.5} sx={{ height: '100%', width: '100%', p: 2, alignItems: 'flex-start', textAlign: 'left', overflow: 'hidden' }}>
      {offline.length > 0 ? <CloudOffOutlinedIcon color="warning" aria-hidden /> : <WifiOutlinedIcon color="success" aria-hidden />}
      <Typography sx={{ fontWeight: 600, lineHeight: 1.25 }}>{text}</Typography>
      {size !== 'S1x1' && offline.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          {offline.slice(0, NAMES_SHOWN).map((d) => d.name).join(', ')}
          {offline.length > NAMES_SHOWN && ` and ${offline.length - NAMES_SHOWN} more`}
        </Typography>
      )}
    </Stack>
  )
  if (offline.length === 0) return content
  return (
    <>
      <ButtonBase aria-label={text} onClick={() => setOpen(true)} sx={{ height: '100%', width: '100%' }}>
        {content}
      </ButtonBase>
      <OfflineDialog open={open} devices={offline} onClose={() => setOpen(false)} />
    </>
  )
}

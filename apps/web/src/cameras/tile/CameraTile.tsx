import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import type { Device } from '../../dashboard/types'
import type { PlayerPhase } from '../../device/lib/playerMachine'
import { TileVideo } from './TileVideo'
import { useKeepRetrying } from './useKeepRetrying'

const STATUS: Partial<Record<PlayerPhase, string>> = {
  connecting: 'Connecting…',
  retrying: 'Reconnecting…',
  unavailable: 'Unavailable',
  cloudUnavailable: 'Unavailable',
  ended: 'Signed out',
}

/** One grid slot: the camera's live sub-stream, its name, and a status while it isn't playing. Tap opens it full size. */
export function CameraTile({ device, onOpen }: { device: Device; onOpen: (device: Device) => void }) {
  const [phase, setPhase] = useState<PlayerPhase>('connecting')
  const generation = useKeepRetrying(phase)
  const status = STATUS[phase]
  return (
    <ButtonBase
      aria-label={`Open ${device.name}`}
      onClick={() => onOpen(device)}
      sx={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '16 / 9', bgcolor: 'common.black', borderRadius: 1, overflow: 'hidden' }}
    >
      <TileVideo key={generation} deviceId={device.id} cloud={device.connection === 'CLOUD'} onPhase={setPhase} />
      <Typography variant="caption" sx={{ position: 'absolute', left: 8, bottom: 6, color: 'common.white', textShadow: '0 1px 3px rgba(0,0,0,.8)', fontWeight: 600 }}>
        {device.name}
      </Typography>
      {status && <Chip size="small" label={status} sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(0,0,0,.6)', color: 'common.white' }} />}
    </ButtonBase>
  )
}

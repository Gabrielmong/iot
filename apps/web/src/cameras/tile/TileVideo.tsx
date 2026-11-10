import Box from '@mui/material/Box'
import { useEffect, useRef } from 'react'
import { useLiveStream } from '../../device/camera/useLiveStream'
import type { PlayerPhase } from '../../device/lib/playerMachine'

type Props = { deviceId: string; cloud: boolean; onPhase: (phase: PlayerPhase) => void }

/** A muted live video of the camera's light sub-stream; reports its player phase. */
export function TileVideo({ deviceId, cloud, onPhase }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { phase } = useLiveStream(deviceId, videoRef, cloud, 'sub')
  useEffect(() => onPhase(phase), [phase, onPhase])
  return <Box component="video" ref={videoRef} autoPlay playsInline muted sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
}

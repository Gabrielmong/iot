import Box from '@mui/material/Box'
import { useRef, useState, type ReactNode } from 'react'
import { toggleFullScreen } from '../lib/fullScreen'
import { PlayerControls } from './PlayerControls'
import { PlayerStatus } from './PlayerStatus'
import { useLiveStream } from './useLiveStream'

/**
 * The camera's live video (muted by default), its status and controls. `cloud`: it streams via the Tuya cloud.
 * `overlay`: extra controls drawn over the video (inside the frame, so they also show in full screen).
 */
export function CameraPlayer({ deviceId, cloud = false, overlay }: { deviceId: string; cloud?: boolean; overlay?: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const { phase } = useLiveStream(deviceId, videoRef, cloud)

  return (
    <Box ref={frameRef} sx={{ position: 'relative', aspectRatio: '16 / 9', bgcolor: 'common.black', borderRadius: 1, overflow: 'hidden' }}>
      <Box
        component="video"
        ref={videoRef}
        aria-label="Live video"
        autoPlay
        playsInline
        muted={muted}
        sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
      />
      <PlayerStatus phase={phase} />
      <PlayerControls
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
        onFullScreen={() => toggleFullScreen(frameRef.current, videoRef.current)}
      />
      {overlay}
    </Box>
  )
}

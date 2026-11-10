import Box from '@mui/material/Box'
import { useEffect, useRef } from 'react'
import type { PanDirection } from '../../gql/graphql'
import type { CameraControls } from '../data/useCameraControls'
import { DirectionPad } from './DirectionPad'
import { PresetBar } from './PresetBar'
import { useOverlayIdle } from './useOverlayIdle'

export type OverlayActions = {
  move: (d: PanDirection) => void
  stop: () => void
  gotoPreset: (slot: number) => void
  savePreset: (slot: number) => void
}

type Props = { controls: CameraControls; actions: OverlayActions }

/**
 * Arrows (bottom-left) and saved positions (top-right) over the video. They fade when idle and come
 * back on any touch or mouse move over the video (listened for on the player frame, the parent).
 */
export function ControlOverlay({ controls, actions }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const { visible, wake } = useOverlayIdle()

  useEffect(() => {
    const frame = ref.current?.parentElement
    if (!frame) return
    frame.addEventListener('pointermove', wake)
    frame.addEventListener('pointerdown', wake)
    return () => {
      frame.removeEventListener('pointermove', wake)
      frame.removeEventListener('pointerdown', wake)
    }
  }, [wake])

  const move = (d: PanDirection) => {
    wake()
    actions.move(d)
  }
  const layer = { position: 'absolute', pointerEvents: visible ? 'auto' : 'none' } as const

  return (
    <Box
      ref={ref}
      data-testid="camera-overlay"
      data-visible={String(visible)}
      sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: visible ? 1 : 0, transition: 'opacity 300ms' }}
    >
      {controls.pan && (
        <Box sx={{ ...layer, left: 8, bottom: 8 }}>
          <DirectionPad onMove={move} onStop={actions.stop} />
        </Box>
      )}
      {controls.presets && (
        <Box sx={{ ...layer, right: 8, top: 8 }}>
          <PresetBar presets={controls.presets} onGo={actions.gotoPreset} onSave={actions.savePreset} />
        </Box>
      )}
    </Box>
  )
}

import { useSortable } from '@dnd-kit/sortable'
import Box from '@mui/material/Box'
import { motion } from 'framer-motion'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { settle } from '../../motion/tokens'
import type { ArrangedTile } from '../lib/reconcileLayout'
import { tileSpan, type TileSize } from '../lib/tileSize'
import { DeviceTile } from '../tile/DeviceTile'
import { SizePicker } from './SizePicker'

type Props = {
  tile: ArrangedTile
  onMoveBy: (deviceId: string, delta: number) => void
  onResize: (deviceId: string, size: TileSize) => void
}

const noop = () => {}
const STEP: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }

/**
 * A card in arrange mode: the real tile, made inert so it can't be switched, under a drag handle that
 * covers it. Keyboard: Space/Enter picks the card up, arrows move it along the list, Space/Enter/Escape drop it.
 */
export function SortableTile({ tile, onMoveBy, onResize }: Props) {
  const { device, size } = tile
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: device.id })
  const [lifted, setLifted] = useState(false)
  const handleRef = useRef<HTMLDivElement>(null)
  // Set while a keyboard move reorders the DOM, which can blur the handle: keep the card lifted and refocus it.
  const moving = useRef(false)
  const { cols, rows } = tileSpan(size)

  useEffect(() => {
    if (!moving.current) return
    moving.current = false
    handleRef.current?.focus()
  })

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setLifted((l) => !l)
    } else if (e.key === 'Escape') {
      setLifted(false)
    } else if (lifted && STEP[e.key]) {
      e.preventDefault()
      moving.current = true
      onMoveBy(device.id, STEP[e.key])
    }
  }

  return (
    <Box
      component={motion.div}
      ref={setNodeRef}
      layout
      transition={settle}
      data-tile-size={size}
      style={{ gridColumn: `span ${cols}`, gridRow: `span ${rows}` }}
      sx={{ position: 'relative', minWidth: 0, opacity: isDragging ? 0.35 : 1 }}
    >
      <Box inert sx={{ height: '100%' }}>
        <DeviceTile device={device} isAdmin={false} onToggle={noop} onOpenDetails={noop} />
      </Box>
      <Box
        {...attributes}
        {...listeners}
        ref={handleRef}
        role="button"
        tabIndex={0}
        aria-label={`Move ${device.name}`}
        aria-pressed={lifted}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!moving.current) setLifted(false)
        }}
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: '10px',
          cursor: 'grab',
          touchAction: 'manipulation',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          outline: '2px dashed',
          outlineColor: lifted ? 'primary.main' : 'rgba(255, 181, 71, 0.55)',
          outlineOffset: -4,
          bgcolor: lifted ? 'rgba(255, 181, 71, 0.08)' : 'transparent',
          transition: 'background-color 150ms',
          '&:focus-visible': { outlineStyle: 'solid', outlineColor: 'primary.main' },
        }}
      />
      <Box sx={{ position: 'absolute', left: 8, bottom: 8, zIndex: 1 }}>
        <SizePicker deviceName={device.name} value={size} onChange={(next) => onResize(device.id, next)} />
      </Box>
    </Box>
  )
}

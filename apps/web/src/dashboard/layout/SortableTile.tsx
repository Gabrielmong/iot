import { useSortable } from '@dnd-kit/sortable'
import Box from '@mui/material/Box'
import { motion } from 'framer-motion'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { settle } from '../../motion/tokens'
import type { ArrangedTile } from '../lib/reconcileLayout'
import { tileSpan, type TileSize } from '../lib/tileSize'
import { RemoveTileButton } from './RemoveTileButton'
import { SizePicker } from './SizePicker'
import type { WidgetData } from '../widgets/useWidgetData'
import { TileFace, tileName } from './TileFace'

type Props = {
  tile: ArrangedTile
  data: WidgetData
  onMoveBy: (key: string, delta: number) => void
  onResize: (key: string, size: TileSize) => void
  onRemove: (key: string) => void
  /** Devices can be taken off this tab (Home); widgets always can. */
  devicesRemovable?: boolean
}
const STEP: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }

/**
 * A card in arrange mode: the real tile, made inert so it can't be switched, under a drag handle that
 * covers it; a widget (and, on Home, a device) also gets a remove ×. Keyboard: Space/Enter picks the card up, arrows move it along the list, Space/Enter/Escape drop it.
 */
export function SortableTile({ tile, data, onMoveBy, onResize, onRemove, devicesRemovable = false }: Props) {
  const { key, size } = tile
  const name = tileName(tile)
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: key })
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
      onMoveBy(key, STEP[e.key])
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
        <TileFace tile={tile} data={data} />
      </Box>
      <Box
        {...attributes}
        {...listeners}
        ref={handleRef}
        role="button"
        tabIndex={0}
        aria-label={`Move ${name}`}
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
        <SizePicker deviceName={name} value={size} onChange={(next) => onResize(key, next)} />
      </Box>
      {'widget' in tile ? (
        <RemoveTileButton label={`Remove ${name}`} onRemove={() => onRemove(key)} />
      ) : (
        devicesRemovable && <RemoveTileButton label={`Remove ${name} from Home`} onRemove={() => onRemove(key)} />
      )}
    </Box>
  )
}

import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragOverEvent,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import Box from '@mui/material/Box'
import { useRef, useState } from 'react'
import type { Weather } from '../../weather/data/useWeather'
import { isNewDragTarget } from '../lib/dragTarget'
import { gridSx } from '../lib/gridSx'
import type { ArrangedTile } from '../lib/reconcileLayout'
import type { TileSize } from '../lib/tileSize'
import type { WidgetKind } from '../widgets/widgetKinds'
import { LiftedCard } from './LiftedCard'
import { SortableTile } from './SortableTile'

type Props = {
  tiles: readonly ArrangedTile[]
  weather: Weather | undefined
  onMove: (activeKey: string, overKey: string) => void
  onMoveBy: (key: string, delta: number) => void
  onResize: (key: string, size: TileSize) => void
  onRemoveWidget: (kind: WidgetKind) => void
}

/** The card under the pointer, else the nearest one: works for cards of different sizes. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : closestCenter(args)
}

/** No sortable transforms: the list itself reorders while dragging and framer-motion animates the reflow. */
const noTransforms = () => null

/**
 * The grid in arrange mode. Mouse drags start after 6 px; touch needs a 200 ms hold so the page still
 * scrolls. The dragged card follows the pointer in an overlay while the others slide into place.
 */
export function ArrangeGrid({ tiles, weather, onMove, onMoveBy, onResize, onRemoveWidget }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
  const lastOver = useRef<string | null>(null)
  const onDragOver = ({ active, over }: DragOverEvent) => {
    const overId = over ? String(over.id) : null
    if (!isNewDragTarget(lastOver.current, String(active.id), overId)) return
    lastOver.current = overId
    onMove(String(active.id), overId as string)
  }
  const active = tiles.find((t) => t.key === activeId)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ active: a }) => {
        lastOver.current = null
        setActiveId(String(a.id))
      }}
      onDragOver={onDragOver}
      onDragEnd={() => setActiveId(null)}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={tiles.map((t) => t.key)} strategy={noTransforms}>
        <Box sx={gridSx}>
          {tiles.map((tile) => (
            <SortableTile key={tile.key} tile={tile} weather={weather} onMoveBy={onMoveBy} onResize={onResize} onRemoveWidget={onRemoveWidget} />
          ))}
        </Box>
      </SortableContext>
      <DragOverlay>{active ? <LiftedCard tile={active} weather={weather} /> : null}</DragOverlay>
    </DndContext>
  )
}

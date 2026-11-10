import { closestCenter, DndContext, type DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import AddIcon from '@mui/icons-material/Add'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import type { Device, Room } from '../../dashboard/types'
import type { Draft } from '../lib/draft'
import { usableDevices } from '../lib/usableDevices'
import { addStep, moveStep, removeAction, removeStep, setWait, upsertAction } from '../lib/draftOps'
import { SetStepCard } from './SetStepCard'
import { SortableStep } from './SortableStep'
import { WaitStepCard } from './WaitStepCard'

type Props = { draft: Draft; devices: readonly Device[]; rooms?: readonly Room[]; onChange: (draft: Draft) => void }

/**
 * The routine's steps in order. Drag (mouse after 6 px, touch after a 200 ms hold) or use the arrow
 * buttons to reorder. Only lights, switches and plugs can be added (not a power strip whose outlets show).
 */
export function StepList({ draft, devices, rooms = [], onChange }: Props) {
  const usable = usableDevices(devices)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
  const keys = draft.steps.map((s) => s.key)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    onChange(moveStep(draft, keys.indexOf(String(active.id)), keys.indexOf(String(over.id))))
  }

  return (
    <Stack spacing={1.5}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          {draft.steps.map((s, i) => (
            <SortableStep
              key={s.key}
              id={s.key}
              number={i + 1}
              count={draft.steps.length}
              title={s.kind === 'WAIT' ? 'Wait' : 'Set devices'}
              dashed={s.kind === 'WAIT'}
              onMove={(delta) => onChange(moveStep(draft, i, i + delta))}
              onRemove={() => onChange(removeStep(draft, s.key))}
            >
              {s.kind === 'WAIT' ? (
                <WaitStepCard minutes={s.minutes} onChange={(m) => onChange(setWait(draft, s.key, m))} />
              ) : (
                <SetStepCard
                  actions={s.actions}
                  devices={usable}
                  rooms={rooms}
                  onUpsert={(a) => onChange(upsertAction(draft, s.key, a))}
                  onRemove={(id) => onChange(removeAction(draft, s.key, id))}
                />
              )}
            </SortableStep>
          ))}
        </SortableContext>
      </DndContext>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => onChange(addStep(draft, 'SET'))}>
          Add device step
        </Button>
        <Button variant="outlined" startIcon={<TimerOutlinedIcon />} onClick={() => onChange(addStep(draft, 'WAIT'))}>
          Add wait
        </Button>
      </Box>
    </Stack>
  )
}

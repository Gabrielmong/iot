import { closestCenter, DndContext, type DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import AddIcon from '@mui/icons-material/Add'
import PlaylistPlayOutlinedIcon from '@mui/icons-material/PlaylistPlayOutlined'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useState } from 'react'
import { useCallableRoutines } from '../data/useCallableRoutines'
import type { Device, Room } from '../../dashboard/types'
import type { Draft } from '../lib/draft'
import { usableDevices } from '../lib/usableDevices'
import { addConditionStep, addRoutineStep, addStep, moveStep, removeStep, setIfRoutine, setStepRoutine } from '../lib/draftOps'
import { STEP_TITLE } from '../lib/stepTitle'
import { AddCheckButton } from './AddCheckButton'
import { RoutinePickerDialog } from './RoutinePickerDialog'
import { SortableStep } from './SortableStep'
import { type PickSlot, StepBody } from './StepBody'

type Props = { draft: Draft; devices: readonly Device[]; rooms?: readonly Room[]; routineId?: string | null; onChange: (draft: Draft) => void }

/** The open routine picker: for a new Run routine step (`key` null), or a step's routine / If branch. */
type Picking = { key: string | null; slot: PickSlot }

/**
 * The routine's steps in order. Drag (mouse after 6 px, touch after a 200 ms hold) or use the arrow
 * buttons to reorder. Only lights, switches and plugs can be added (not a power strip whose outlets show).
 */
export function StepList({ draft, devices, rooms = [], routineId = null, onChange }: Props) {
  const { routines } = useCallableRoutines(draft.scope, routineId)
  const [picking, setPicking] = useState<Picking | null>(null)
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
  const pick = (routine: { id: string; name: string }) => {
    if (!picking) return
    const { key, slot } = picking
    if (key === null) onChange(addRoutineStep(draft, routine))
    else if (slot === 'routine') onChange(setStepRoutine(draft, key, routine))
    else onChange(setIfRoutine(draft, key, slot, routine))
    setPicking(null)
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
              title={STEP_TITLE[s.kind]}
              dashed={s.kind === 'WAIT'}
              onMove={(delta) => onChange(moveStep(draft, i, i + delta))}
              onRemove={() => onChange(removeStep(draft, s.key))}
            >
              <StepBody step={s} draft={draft} devices={usable} rooms={rooms} onChange={onChange} onPick={(slot) => setPicking({ key: s.key, slot })} />
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
        <Button variant="outlined" startIcon={<PlaylistPlayOutlinedIcon />} onClick={() => setPicking({ key: null, slot: 'routine' })}>
          Add routine
        </Button>
        <AddCheckButton onAdd={(kind) => onChange(addConditionStep(draft, kind))} />
      </Box>
      {picking !== null && <RoutinePickerDialog routines={routines} onPick={pick} onClose={() => setPicking(null)} />}
    </Stack>
  )
}

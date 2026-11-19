import type { Device, Room } from '../../dashboard/types'
import type { Draft, DraftStep } from '../lib/draft'
import { removeAction, setConditions, setIfRoutine, setWait, upsertAction } from '../lib/draftOps'
import { ContinueIfStepCard } from './ContinueIfStepCard'
import { IfStepCard } from './IfStepCard'
import { RoutineStepCard } from './RoutineStepCard'
import { SetStepCard } from './SetStepCard'
import { WaitStepCard } from './WaitStepCard'

/** Which routine a picker fills: a Run routine step's, or an If's then / otherwise. */
export type PickSlot = 'routine' | 'then' | 'else'

type Props = {
  step: DraftStep
  draft: Draft
  devices: readonly Device[]
  rooms: readonly Room[]
  onChange: (draft: Draft) => void
  onPick: (slot: PickSlot) => void
}

/** The editable body of one step card, by kind. */
export function StepBody({ step: s, draft, devices, rooms, onChange, onPick }: Props) {
  switch (s.kind) {
    case 'WAIT':
      return <WaitStepCard minutes={s.minutes} onChange={(m) => onChange(setWait(draft, s.key, m))} />
    case 'ROUTINE':
      return <RoutineStepCard name={s.routineName} onChange={() => onPick('routine')} />
    case 'CONTINUE_IF':
      return <ContinueIfStepCard conditions={s.conditions} onChange={(c) => onChange(setConditions(draft, s.key, c))} />
    case 'IF':
      return (
        <IfStepCard
          step={s}
          onConditions={(c) => onChange(setConditions(draft, s.key, c))}
          onPick={onPick}
          onClearElse={() => onChange(setIfRoutine(draft, s.key, 'else', null))}
        />
      )
    case 'SET':
      return (
        <SetStepCard
          actions={s.actions}
          devices={devices}
          rooms={rooms}
          onUpsert={(a) => onChange(upsertAction(draft, s.key, a))}
          onRemove={(id) => onChange(removeAction(draft, s.key, id))}
        />
      )
  }
}

import Stack from '@mui/material/Stack'
import type { DraftCondition, DraftStep } from '../lib/draft'
import { ConditionList } from './ConditionList'
import { RoutineSlot } from './RoutineSlot'

type IfStep = Extract<DraftStep, { kind: 'IF' }>
type Props = {
  step: IfStep
  onConditions: (conditions: DraftCondition[]) => void
  onPick: (branch: 'then' | 'else') => void
  onClearElse: () => void
}

/** If the checks hold, run one routine; otherwise run another (or nothing). */
export function IfStepCard({ step, onConditions, onPick, onClearElse }: Props) {
  return (
    <Stack spacing={1.5}>
      <ConditionList conditions={step.conditions} onChange={onConditions} />
      <RoutineSlot
        label="Then run"
        id={step.thenRoutineId}
        name={step.thenRoutineName}
        emptyText="No routine picked"
        pickLabel="Pick the routine to run"
        onPick={() => onPick('then')}
      />
      <RoutineSlot
        label="Otherwise run"
        id={step.elseRoutineId}
        name={step.elseRoutineName}
        emptyText="Nothing"
        pickLabel="Pick the routine to run otherwise"
        onPick={() => onPick('else')}
        onClear={onClearElse}
      />
    </Stack>
  )
}

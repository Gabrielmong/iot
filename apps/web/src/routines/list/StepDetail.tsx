import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { useId } from 'react'
import { describeAction } from '../lib/describeAction'
import { reasonText } from '../lib/runLabel'
import { clockTime, timeLeft, type StepState } from '../lib/runProgress'
import type { Routine, RoutineRun } from '../types'
import { CalledRoutineProblems } from './CalledRoutineProblems'

type Props = {
  index: number
  step: Routine['steps'][number]
  state: StepState
  run: RoutineRun | null | undefined
  deviceNames: ReadonlyMap<string, string>
  now: Date
}

/** Read by screen readers only. */
// Pixel strings: in sx, a number up to 1 means a percentage (width: 1 would be 100%).
const visuallyHidden = { position: 'absolute', width: '1px', height: '1px', margin: '-1px', padding: 0, border: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const

const CHIP: Partial<Record<StepState, { label: string; color: 'success' | 'primary' | 'default' }>> = {
  done: { label: 'Done', color: 'success' },
  current: { label: 'Now', color: 'primary' },
  next: { label: 'Next', color: 'default' },
}

/** One step in the run details: what it does, where the run is, and how each device went. */
export function StepDetail({ index, step, state, run, deviceNames, now }: Props) {
  const titleId = useId()
  const chip = CHIP[state]
  const title = stepTitle(step)
  const showResults = state === 'done' || (state === 'idle' && run != null && run.status !== 'RUNNING')
  return (
    <Box
      component="li"
      aria-labelledby={titleId}
      sx={{
        listStyle: 'none',
        py: 1,
        pl: 1.5,
        borderLeft: 3,
        borderColor: state === 'current' ? 'primary.main' : 'transparent',
        opacity: state === 'done' ? 0.75 : 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography id={titleId} variant="subtitle2">
          <Box component="span" sx={visuallyHidden}>
            Step {index + 1}:{' '}
          </Box>
          {index + 1} · {title}
        </Typography>
        {chip && <Chip size="small" label={chip.label} color={chip.color} variant={state === 'next' ? 'outlined' : 'filled'} />}
      </Box>
      {step.kind === 'WAIT' && state === 'current' && run?.waitUntil && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {timeLeft(run.waitUntil, now)} · next step at {clockTime(run.waitUntil)}
        </Typography>
      )}
      {step.kind === 'ROUTINE' && showResults && <CalledRoutineProblems problems={run?.problems.filter((p) => p.step === index) ?? []} />}
      {step.kind === 'SET' &&
        step.actions.map((a) => {
          const name = deviceNames.get(a.deviceId) ?? 'Another device'
          const problem = run?.problems.find((p) => p.step === index && p.deviceId === a.deviceId)
          const result = !showResults ? '' : problem ? ` ⚠ ${reasonText(problem.reason)}` : ' ✓'
          return (
            <Typography key={a.deviceId} variant="body2" sx={{ color: problem && showResults ? 'warning.main' : 'text.secondary' }}>
              {`${name}: ${describeAction({ on: a.on ?? null, brightness: a.brightness ?? null, color: a.color ?? null, colorTempK: a.colorTempK ?? null })}${result}`}
            </Typography>
          )
        })}
    </Box>
  )
}

function stepTitle(step: Routine['steps'][number]): string {
  if (step.kind === 'WAIT') return `Wait ${step.waitMinutes} min`
  if (step.kind === 'ROUTINE') return step.routineName ? `Run ${step.routineName}` : 'Removed routine'
  return 'Set devices'
}

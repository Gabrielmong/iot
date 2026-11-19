import type { Routine, RoutineRun } from '../types'

type Step = Routine['steps'][number]
export type StepState = 'done' | 'current' | 'next' | 'later' | 'idle'

const MINUTE_MS = 60_000
const pad = (n: number) => String(n).padStart(2, '0')

/** "20:48" in local time. */
export function clockTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "12 min left", "1 h 25 min left", "less than a minute left" (rounded down to whole minutes). */
export function timeLeft(untilIso: string, now: Date): string {
  const minutes = Math.floor((new Date(untilIso).getTime() - now.getTime()) / MINUTE_MS)
  if (minutes < 1) return 'less than a minute left'
  if (minutes < 60) return `${minutes} min left`
  const rest = minutes % 60
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''} left`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export type StepProgress = { label: string; shortLabel: string; fraction: number }

/**
 * "Step 2 of 3 · Waiting · 12 min left" (`shortLabel` without the countdown) and how far along the
 * run is (0–1); null unless running.
 */
export function stepProgress(steps: readonly Step[], run: RoutineRun | null | undefined, now: Date): StepProgress | null {
  if (run?.status !== 'RUNNING' || run.currentStep == null) return null
  const index = run.currentStep
  const step = steps[index]
  if (!step) return null
  const prefix = `Step ${index + 1} of ${steps.length}`
  if (run.currentPath.length > 0) return insideRoutine(prefix, run, index / steps.length, now)
  if (step.kind === 'ROUTINE') {
    const label = `${prefix} · Running ${step.routineName ?? 'a routine'}…`
    return { label, shortLabel: label, fraction: index / steps.length }
  }
  if (step.kind === 'SET') {
    const label = `${prefix} · Setting ${plural(step.actions.length, 'device')}…`
    return { label, shortLabel: label, fraction: index / steps.length }
  }
  if (step.kind === 'CONTINUE_IF' || step.kind === 'IF') {
    const label = `${prefix} · Checking the weather…`
    return { label, shortLabel: label, fraction: index / steps.length }
  }
  const total = (step.waitMinutes ?? 0) * MINUTE_MS
  const left = run.waitUntil ? Math.max(0, new Date(run.waitUntil).getTime() - now.getTime()) : total
  const through = total > 0 ? Math.min(1, 1 - left / total) : 0
  const remaining = run.waitUntil ? ` · ${timeLeft(run.waitUntil, now)}` : ''
  return { label: `${prefix} · Waiting${remaining}`, shortLabel: `${prefix} · Waiting`, fraction: (index + through) / steps.length }
}

/** "Step 3 of 3 · Lock up › step 2 of 4 · Waiting · 12 min left": where a called routine has got to. */
function insideRoutine(prefix: string, run: RoutineRun, fraction: number, now: Date): StepProgress {
  const inner = run.currentPath[run.currentPath.length - 1]!
  const where = `${prefix} · ${run.currentPath.map((c) => c.routineName).join(' › ')} › step ${inner.step + 1} of ${inner.stepCount}`
  if (!run.waitUntil) {
    const label = `${where} · Running…`
    return { label, shortLabel: label, fraction }
  }
  return { label: `${where} · Waiting · ${timeLeft(run.waitUntil, now)}`, shortLabel: `${where} · Waiting`, fraction }
}

/** "Step 2 of 3 · Waiting" for a running routine (no countdown, so no clock needed); null otherwise. */
export function currentStepLabel(steps: readonly Step[], run: RoutineRun | null | undefined): string | null {
  return stepProgress(steps, run, new Date(0))?.shortLabel ?? null
}

/** Where each step stands in a running routine; all "idle" when it isn't running. */
export function stepStates(count: number, run: RoutineRun | null | undefined): StepState[] {
  const current = run?.status === 'RUNNING' ? run.currentStep : null
  return Array.from({ length: count }, (_, i): StepState => {
    if (current == null) return 'idle'
    if (i < current) return 'done'
    if (i === current) return 'current'
    return i === current + 1 ? 'next' : 'later'
  })
}

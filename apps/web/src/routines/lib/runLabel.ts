import type { ProblemReason } from '../../gql/graphql'
import type { RoutineRun } from '../types'

export type RunIcon = 'running' | 'ok' | 'warn' | null

const LABELS: Record<RoutineRun['status'], { icon: RunIcon; text: string }> = {
  RUNNING: { icon: 'running', text: 'Running…' },
  OK: { icon: 'ok', text: 'Done' },
  PARTIAL: { icon: 'warn', text: 'Some devices had problems' },
  FAILED: { icon: 'warn', text: "Didn't work" },
  INTERRUPTED: { icon: 'warn', text: 'Interrupted by a server restart' },
  STOPPED: { icon: null, text: 'Stopped' },
}

/** How a routine's last run is shown next to it. */
export function runLabel(run: RoutineRun | null | undefined): { icon: RunIcon; text: string } {
  return run ? LABELS[run.status] : { icon: null, text: '' }
}

const REASONS: Record<ProblemReason, string> = {
  UNREACHABLE: "couldn't reach it",
  NOT_READY: 'needs setup',
  NO_ACCESS: 'no access',
  REMOVED: 'removed',
}

export const reasonText = (reason: ProblemReason) => REASONS[reason]

export const problemText = (p: { deviceName: string; reason: ProblemReason }) => `${p.deviceName}: ${REASONS[p.reason]}`

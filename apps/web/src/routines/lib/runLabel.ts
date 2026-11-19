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
  ROUTINE_REMOVED: 'routine removed',
  NESTED_TOO_DEEP: 'too many routines inside each other',
  WEATHER_UNAVAILABLE: 'weather unavailable',
}

export const reasonText = (reason: ProblemReason) => REASONS[reason]

/**
 * "Lamp: couldn't reach it"; inside a called routine "Lock up › Lamp: couldn't reach it"; a problem with
 * the call itself has no device ("Routine: routine removed"; inside a called routine "Lock up › Run routine: routine removed").
 * A weather check that couldn't run: "Weather unavailable" ("Lock up › Weather unavailable").
 */
export function problemText(p: { deviceName: string | null; reason: ProblemReason; routineName: string | null }): string {
  if (p.reason === 'NESTED_TOO_DEEP') return REASONS.NESTED_TOO_DEEP
  if (p.reason === 'WEATHER_UNAVAILABLE') return `${p.routineName ? `${p.routineName} › ` : ''}Weather unavailable`
  if (p.deviceName == null) return p.routineName ? `${p.routineName} › Run routine: ${REASONS[p.reason]}` : `Routine: ${REASONS[p.reason]}`
  const where = p.routineName ? `${p.routineName} › ` : ''
  return `${where}${p.deviceName}: ${REASONS[p.reason]}`
}

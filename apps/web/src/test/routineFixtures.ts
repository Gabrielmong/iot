import type { ProblemReason, RoutineFieldsFragment, RunNoteKind, RunStatus } from '../gql/graphql'
import { liveSubscription, reply, type Handler } from './testClient'

type Routine = RoutineFieldsFragment
type Schedule = Routine['schedules'][number]
/** A schedule; anchor and offset default to a clock time. */
type ScheduleOpt = Omit<Schedule, 'anchor' | 'offsetMinutes'> & Partial<Pick<Schedule, 'anchor' | 'offsetMinutes'>>
type Opts = Partial<Pick<Routine, 'id' | 'name' | 'scope' | 'editable' | 'audience' | 'room' | 'owner' | 'lastRun'>> & {
  schedules?: ScheduleOpt[]
  deviceIds?: string[]
  /** Device ids reported as removed (deviceExists: false). */
  removedIds?: string[]
}

/** A run as the server sends it (with `__typename`s). */
type ProblemOpts = { deviceName: string | null; reason: ProblemReason; step?: number; deviceId?: string; routineName?: string | null }
type Progress = { currentStep?: number | null; waitUntil?: string | null; startedBy?: string | null; notes?: NoteOpts[] }
type NoteOpts = { kind: RunNoteKind; conditions: string; step?: number; routineName?: string | null; ranRoutineName?: string | null }

/** Step fields only condition steps use, empty. */
export const NO_CONDITION_FIELDS = { conditions: [], thenRoutineId: null, thenRoutineName: null, elseRoutineId: null, elseRoutineName: null }

export function runFixture(status: RunStatus, problems: ProblemOpts[] = [], hiddenProblems = 0, progress: Progress = {}) {
  return {
    __typename: 'RoutineRun' as const,
    status,
    startedAt: '2026-11-09T20:00:00.000Z',
    endedAt: status === 'RUNNING' ? null : '2026-11-09T20:00:01.000Z',
    problems: problems.map((p) => ({ __typename: 'RunProblem' as const, step: 0, deviceId: p.deviceName?.toLowerCase() ?? null, routineName: null, ...p })),
    hiddenProblems,
    notes: (progress.notes ?? []).map((n) => ({ __typename: 'RunNote' as const, step: 0, routineName: null, ranRoutineName: null, ...n })),
    currentPath: [],
    currentStep: progress.currentStep ?? (status === 'RUNNING' ? 0 : null),
    waitUntil: progress.waitUntil ?? null,
    startedBy: progress.startedBy === undefined ? 'Ann' : progress.startedBy,
  }
}

/** A routine as the server returns it: one Set step switching `deviceIds` on. */
export function routineFixture(o: Opts = {}): Routine {
  const routine = {
    __typename: 'Routine',
    id: o.id ?? 'r1',
    name: o.name ?? 'Movie night',
    scope: o.scope ?? 'PERSONAL',
    editable: o.editable ?? true,
    audience: o.audience ?? [],
    room: o.room === undefined ? null : o.room && { __typename: 'Room', ...o.room },
    owner: o.owner === undefined ? null : o.owner && { __typename: 'User', ...o.owner },
    steps: [
      {
        __typename: 'RoutineStep',
        kind: 'SET',
        waitMinutes: null,
        routineId: null,
        routineName: null,
        ...NO_CONDITION_FIELDS,
        actions: (o.deviceIds ?? ['lamp']).map((deviceId) => ({
          __typename: 'DeviceAction',
          deviceId,
          deviceExists: !(o.removedIds ?? []).includes(deviceId),
          on: true,
          brightness: null,
          color: null,
          colorTempK: null,
          pcPower: null,
        })),
      },
    ],
    schedules: (o.schedules ?? []).map((s) => ({ __typename: 'RoutineSchedule' as const, anchor: 'CLOCK' as const, offsetMinutes: 0, ...s })),
    lastRun: o.lastRun ?? null,
  }
  return routine as Routine
}

/** Handlers for screens that show routines but whose tests aren't about them. */
export function routineHandlers(routines: Routine[] = []): Record<string, Handler> {
  return { Routines: reply({ routines }), RoutineRunChanged: liveSubscription().handler, RoutinesChanged: liveSubscription().handler }
}

import type { ProblemReason, RoutineFieldsFragment, RunStatus } from '../gql/graphql'
import { liveSubscription, reply, type Handler } from './testClient'

type Routine = RoutineFieldsFragment
type Opts = Partial<Pick<Routine, 'id' | 'name' | 'scope' | 'editable' | 'audience' | 'room' | 'owner' | 'schedules' | 'lastRun'>> & {
  deviceIds?: string[]
  /** Device ids reported as removed (deviceExists: false). */
  removedIds?: string[]
}

/** A run as the server sends it (with `__typename`s). */
type ProblemOpts = { deviceName: string | null; reason: ProblemReason; step?: number; deviceId?: string; routineName?: string | null }
type Progress = { currentStep?: number | null; waitUntil?: string | null; startedBy?: string | null }

export function runFixture(status: RunStatus, problems: ProblemOpts[] = [], hiddenProblems = 0, progress: Progress = {}) {
  return {
    __typename: 'RoutineRun' as const,
    status,
    startedAt: '2026-11-09T20:00:00.000Z',
    endedAt: status === 'RUNNING' ? null : '2026-11-09T20:00:01.000Z',
    problems: problems.map((p) => ({ __typename: 'RunProblem' as const, step: 0, deviceId: p.deviceName?.toLowerCase() ?? null, routineName: null, ...p })),
    hiddenProblems,
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
    schedules: (o.schedules ?? []).map((s) => ({ __typename: 'RoutineSchedule', ...s })),
    lastRun: o.lastRun ?? null,
  }
  return routine as Routine
}

/** Handlers for screens that show routines but whose tests aren't about them. */
export function routineHandlers(routines: Routine[] = []): Record<string, Handler> {
  return { Routines: reply({ routines }), RoutineRunChanged: liveSubscription().handler, RoutinesChanged: liveSubscription().handler }
}

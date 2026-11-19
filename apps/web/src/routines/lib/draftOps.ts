import { DEFAULT_TIME, newKey, type Draft, type DraftAction, type DraftCondition, type DraftSchedule, type DraftStep } from './draft'

export const DEFAULT_WAIT_MINUTES = 5
const DEFAULT_SCHEDULE = { anchor: 'CLOCK' as const, time: DEFAULT_TIME, offsetMinutes: 0, days: [1, 2, 3, 4, 5], enabled: true }

const mapStep = (d: Draft, key: string, fn: (s: DraftStep) => DraftStep): Draft => ({ ...d, steps: d.steps.map((s) => (s.key === key ? fn(s) : s)) })

export function addStep(d: Draft, kind: 'SET' | 'WAIT'): Draft {
  const step: DraftStep = kind === 'WAIT' ? { key: newKey(), kind, minutes: DEFAULT_WAIT_MINUTES } : { key: newKey(), kind: 'SET', actions: [] }
  return { ...d, steps: [...d.steps, step] }
}

export const addRoutineStep = (d: Draft, routine: { id: string; name: string }): Draft => ({
  ...d,
  steps: [...d.steps, { key: newKey(), kind: 'ROUTINE', routineId: routine.id, routineName: routine.name }],
})

export const setStepRoutine = (d: Draft, key: string, routine: { id: string; name: string }): Draft =>
  mapStep(d, key, (s) => (s.kind === 'ROUTINE' ? { ...s, routineId: routine.id, routineName: routine.name } : s))

/** A new check: temperature above 25°. */
export const newCondition = (): DraftCondition => ({ key: newKey(), metric: 'TEMP_C', op: 'ABOVE', value: 25 })

/** Adds an Only-continue-if or an If step with one check; an If starts with no routine picked. */
export function addConditionStep(d: Draft, kind: 'CONTINUE_IF' | 'IF'): Draft {
  const conditions = [newCondition()]
  const step: DraftStep =
    kind === 'IF'
      ? { key: newKey(), kind, conditions, thenRoutineId: null, thenRoutineName: null, elseRoutineId: null, elseRoutineName: null }
      : { key: newKey(), kind, conditions }
  return { ...d, steps: [...d.steps, step] }
}

export const setConditions = (d: Draft, key: string, conditions: DraftCondition[]): Draft =>
  mapStep(d, key, (s) => (s.kind === 'CONTINUE_IF' || s.kind === 'IF' ? { ...s, conditions } : s))

/** Sets (or with null clears) the routine an If runs when its checks pass (`then`) or don't (`else`). */
export const setIfRoutine = (d: Draft, key: string, branch: 'then' | 'else', routine: { id: string; name: string } | null): Draft =>
  mapStep(d, key, (s) => {
    if (s.kind !== 'IF') return s
    const id = routine?.id ?? null
    const name = routine?.name ?? null
    return branch === 'then' ? { ...s, thenRoutineId: id, thenRoutineName: name } : { ...s, elseRoutineId: id, elseRoutineName: name }
  })

export const removeStep = (d: Draft, key: string): Draft => ({ ...d, steps: d.steps.filter((s) => s.key !== key) })

export function moveStep(d: Draft, from: number, to: number): Draft {
  const steps = [...d.steps]
  const [moved] = steps.splice(from, 1)
  if (!moved) return d
  steps.splice(to, 0, moved)
  return { ...d, steps }
}

export const setWait = (d: Draft, key: string, minutes: number): Draft => mapStep(d, key, (s) => (s.kind === 'WAIT' ? { ...s, minutes } : s))

/** Adds the device to the step, or replaces its settings if it's already there. */
export const upsertAction = (d: Draft, stepKey: string, action: DraftAction): Draft =>
  mapStep(d, stepKey, (s) => {
    if (s.kind !== 'SET') return s
    const exists = s.actions.some((a) => a.deviceId === action.deviceId)
    return { ...s, actions: exists ? s.actions.map((a) => (a.deviceId === action.deviceId ? action : a)) : [...s.actions, action] }
  })

export const removeAction = (d: Draft, stepKey: string, deviceId: string): Draft =>
  mapStep(d, stepKey, (s) => (s.kind === 'SET' ? { ...s, actions: s.actions.filter((a) => a.deviceId !== deviceId) } : s))

export const addSchedule = (d: Draft): Draft => ({ ...d, schedules: [...d.schedules, { key: newKey(), ...DEFAULT_SCHEDULE, days: [...DEFAULT_SCHEDULE.days] }] })

export const updateSchedule = (d: Draft, key: string, patch: Partial<Omit<DraftSchedule, 'key'>>): Draft => ({
  ...d,
  schedules: d.schedules.map((s) => (s.key === key ? { ...s, ...patch } : s)),
})

export const removeSchedule = (d: Draft, key: string): Draft => ({ ...d, schedules: d.schedules.filter((s) => s.key !== key) })

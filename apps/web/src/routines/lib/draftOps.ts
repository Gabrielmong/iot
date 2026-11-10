import { newKey, type Draft, type DraftAction, type DraftSchedule, type DraftStep } from './draft'

export const DEFAULT_WAIT_MINUTES = 5
const DEFAULT_SCHEDULE = { time: '07:00', days: [1, 2, 3, 4, 5], enabled: true }

const mapStep = (d: Draft, key: string, fn: (s: DraftStep) => DraftStep): Draft => ({ ...d, steps: d.steps.map((s) => (s.key === key ? fn(s) : s)) })

export function addStep(d: Draft, kind: DraftStep['kind']): Draft {
  const step: DraftStep = kind === 'WAIT' ? { key: newKey(), kind, minutes: DEFAULT_WAIT_MINUTES } : { key: newKey(), kind, actions: [] }
  return { ...d, steps: [...d.steps, step] }
}

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

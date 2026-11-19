import { MAX_CONDITIONS, METRICS } from './conditionMetrics'
import type { Draft, DraftAction, DraftCondition } from './draft'

/** Mirrors the server's limits so Save can explain what's wrong before sending. */
export const ROUTINE_LIMITS = { maxName: 40, maxSteps: 20, maxDevicesPerStep: 50, minWait: 1, maxWait: 720, maxSchedules: 10 } as const

const changesSomething = (a: DraftAction) => a.on !== null || a.brightness !== null || a.color !== null || a.colorTempK !== null

/** The server's complaint about one check, or null when it's fine. */
function conditionError(c: DraftCondition): string | null {
  const range = METRICS[c.metric].range
  if (!range) return null
  if (c.value === null || Number.isNaN(c.value)) return 'Enter a value'
  const label = METRICS[c.metric].text.replace(/^./, (ch) => ch.toUpperCase())
  return c.value < range.min || c.value > range.max ? `${label} must be from ${range.min} to ${range.max}` : null
}

/** Problems that would stop the draft from saving, in the server's words; [] when it's ready. */
export function draftErrors(d: Draft): string[] {
  const L = ROUTINE_LIMITS
  const errors = new Set<string>()
  const name = d.name.trim()
  if (!name) errors.add('Give the routine a name')
  else if (name.length > L.maxName) errors.add(`Routine name must be 1-${L.maxName} characters`)
  if (d.steps.length > L.maxSteps) errors.add(`A routine can have at most ${L.maxSteps} steps`)
  const actions = d.steps.flatMap((s) => (s.kind === 'SET' ? s.actions : []))
  if (actions.length === 0 && !d.steps.some((s) => s.kind === 'ROUTINE' || s.kind === 'IF')) errors.add('Add a device or a routine')
  if (d.steps.some((s) => s.kind === 'ROUTINE' && s.routineName === null)) errors.add('Remove the missing routine')
  for (const s of d.steps) {
    if (s.kind === 'WAIT' && !(Number.isInteger(s.minutes) && s.minutes >= L.minWait && s.minutes <= L.maxWait)) {
      errors.add(`Waits must be ${L.minWait} to ${L.maxWait} minutes`)
    }
    if (s.kind === 'IF' && s.thenRoutineId === null) errors.add('Pick a routine to run')
    if (s.kind === 'IF' && ((s.thenRoutineId !== null && s.thenRoutineName === null) || (s.elseRoutineId !== null && s.elseRoutineName === null))) {
      errors.add('Replace the removed routine')
    }
    if (s.kind === 'CONTINUE_IF' || s.kind === 'IF') {
      if (s.conditions.length < 1 || s.conditions.length > MAX_CONDITIONS) errors.add(`Add 1 to ${MAX_CONDITIONS} conditions`)
      for (const c of s.conditions) {
        const problem = conditionError(c)
        if (problem) errors.add(problem)
      }
    }
    if (s.kind === 'SET' && s.actions.length > L.maxDevicesPerStep) errors.add(`A step can set at most ${L.maxDevicesPerStep} devices`)
  }
  if (actions.some((a) => a.unavailable)) errors.add('Remove devices that are no longer available')
  for (const a of actions) {
    if (a.on === false) continue
    if (a.color && a.colorTempK !== null) errors.add('Pick a color or a white temperature, not both')
    if (!changesSomething(a)) errors.add('Each device must change something')
  }
  if (d.schedules.length > L.maxSchedules) errors.add(`A routine can have at most ${L.maxSchedules} schedules`)
  if (d.schedules.some((s) => s.days.length === 0)) errors.add('Pick at least one day for each time')
  return [...errors]
}

import type { Draft, DraftAction } from './draft'

/** Mirrors the server's limits so Save can explain what's wrong before sending. */
export const ROUTINE_LIMITS = { maxName: 40, maxSteps: 20, maxDevicesPerStep: 50, minWait: 1, maxWait: 720, maxSchedules: 10 } as const

const changesSomething = (a: DraftAction) => a.on !== null || a.brightness !== null || a.color !== null || a.colorTempK !== null

/** Problems that would stop the draft from saving, in the server's words; [] when it's ready. */
export function draftErrors(d: Draft): string[] {
  const L = ROUTINE_LIMITS
  const errors = new Set<string>()
  const name = d.name.trim()
  if (!name) errors.add('Give the routine a name')
  else if (name.length > L.maxName) errors.add(`Routine name must be 1-${L.maxName} characters`)
  if (d.steps.length > L.maxSteps) errors.add(`A routine can have at most ${L.maxSteps} steps`)
  const actions = d.steps.flatMap((s) => (s.kind === 'SET' ? s.actions : []))
  if (actions.length === 0) errors.add('A routine needs at least one device')
  for (const s of d.steps) {
    if (s.kind === 'WAIT' && !(Number.isInteger(s.minutes) && s.minutes >= L.minWait && s.minutes <= L.maxWait)) {
      errors.add(`Waits must be ${L.minWait} to ${L.maxWait} minutes`)
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

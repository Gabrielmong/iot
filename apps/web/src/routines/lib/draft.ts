import type { Device, Rgb } from '../../dashboard/types'
import type { RoutineScope } from '../../gql/graphql'
import type { Routine, RoutineInput } from '../types'
import { fitDraftAction } from './usableDevices'

/**
 * One device in a Set step. `on: null` leaves power as it is; other nulls leave that setting alone.
 * `unavailable`: the device still exists but this routine can't use it now (no access, or no longer a
 * light/switch/plug); it must be removed before saving.
 */
export type DraftAction = {
  deviceId: string
  on: boolean | null
  brightness: number | null
  color: Rgb | null
  colorTempK: number | null
  unavailable: boolean
}
export type DraftStep = { key: string } & ({ kind: 'SET'; actions: DraftAction[] } | { kind: 'WAIT'; minutes: number })
export type DraftSchedule = { key: string; time: string; days: number[]; enabled: boolean }
export type Draft = {
  name: string
  scope: RoutineScope
  roomId: string | null
  steps: DraftStep[]
  schedules: DraftSchedule[]
  audience: string[]
}

let counter = 0
/** A stable React key for a new step or schedule row. */
export const newKey = () => `k${++counter}`

export function emptyDraft(scope: RoutineScope): Draft {
  return { name: '', scope, roomId: null, steps: [{ key: newKey(), kind: 'SET', actions: [] }], schedules: [], audience: [] }
}

/**
 * The editor's copy of a saved routine. `usable` are the devices the routine may use now: actions on
 * them lose settings the device no longer supports; actions on removed devices are dropped (counted);
 * the rest stay, flagged `unavailable`, so the user can see and remove them.
 */
export function routineToDraft(r: Routine, usable: readonly Device[]): { draft: Draft; droppedDevices: number } {
  const byId = new Map(usable.map((d) => [d.id, d]))
  let droppedDevices = 0
  const steps: DraftStep[] = r.steps.map((s) => {
    if (s.kind === 'WAIT') return { key: newKey(), kind: 'WAIT', minutes: s.waitMinutes ?? 1 }
    const actions: DraftAction[] = []
    for (const a of s.actions) {
      const device = byId.get(a.deviceId)
      if (!device && !a.deviceExists) {
        droppedDevices++
        continue
      }
      const action: DraftAction = {
        deviceId: a.deviceId,
        on: a.on ?? null,
        brightness: a.brightness ?? null,
        color: a.color ? { r: a.color.r, g: a.color.g, b: a.color.b } : null,
        colorTempK: a.colorTempK ?? null,
        unavailable: !device,
      }
      actions.push(device ? fitDraftAction(action, device) : action)
    }
    return { key: newKey(), kind: 'SET', actions }
  })
  const schedules = r.schedules.map((s) => ({ key: newKey(), time: s.time, days: [...s.days], enabled: s.enabled }))
  return {
    draft: { name: r.name, scope: r.scope, roomId: r.room?.id ?? null, steps, schedules, audience: [...r.audience] },
    droppedDevices,
  }
}

export function draftToInput(d: Draft): RoutineInput {
  return {
    name: d.name.trim(),
    scope: d.scope,
    roomId: d.roomId,
    audience: d.scope === 'SHARED' ? d.audience : null,
    steps: d.steps.map((s) =>
      s.kind === 'WAIT'
        ? { kind: 'WAIT', waitMinutes: s.minutes }
        : { kind: 'SET', actions: s.actions.map(({ deviceId, on, brightness, color, colorTempK }) => ({ deviceId, on, brightness, color, colorTempK })) },
    ),
    schedules: d.schedules.map((s) => ({ time: s.time, days: s.days, enabled: s.enabled })),
  }
}

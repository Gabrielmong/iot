import type { Device, Rgb } from '../../dashboard/types'
import type { PcPowerAction, RoutineScope } from '../../gql/graphql'
import type { Routine, RoutineInput } from '../types'
import { fitDraftAction, hasAgent } from './usableDevices'

/**
 * One device in a Set step. `on: null` leaves power as it is; other nulls leave that setting alone.
 * `unavailable`: the device still exists but this routine can't use it now (no access, or no longer a
 * light/switch/plug, or a PC that lost its agent); it must be removed before saving.
 * `pcPower`: Sleep or Shut down a PC with an agent; it stands alone (`on` is null).
 */
export type RoutinePcPower = Extract<PcPowerAction, 'SLEEP' | 'SHUTDOWN'>
export type DraftAction = {
  deviceId: string
  on: boolean | null
  brightness: number | null
  color: Rgb | null
  colorTempK: number | null
  pcPower?: RoutinePcPower | null
  unavailable: boolean
}
/** `routineName: null` means the called routine was removed. */
export type DraftStep = { key: string } & (
  | { kind: 'SET'; actions: DraftAction[] }
  | { kind: 'WAIT'; minutes: number }
  | { kind: 'ROUTINE'; routineId: string; routineName: string | null }
)
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
    if (s.kind === 'ROUTINE') return { key: newKey(), kind: 'ROUTINE', routineId: s.routineId ?? '', routineName: s.routineName ?? null }
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
        pcPower: a.pcPower === 'SLEEP' || a.pcPower === 'SHUTDOWN' ? a.pcPower : null,
        unavailable: !device || (Boolean(a.pcPower) && !hasAgent(device)),
      }
      actions.push(device && !action.unavailable ? fitDraftAction(action, device) : action)
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
    steps: d.steps.map((s) => {
      if (s.kind === 'WAIT') return { kind: 'WAIT', waitMinutes: s.minutes }
      if (s.kind === 'ROUTINE') return { kind: 'ROUTINE', routineId: s.routineId }
      return { kind: 'SET', actions: s.actions.map(({ deviceId, on, brightness, color, colorTempK, pcPower }) => ({
          deviceId,
          on,
          brightness,
          color,
          colorTempK,
          pcPower: pcPower ?? null,
        })) }
    }),
    schedules: d.schedules.map((s) => ({ time: s.time, days: s.days, enabled: s.enabled })),
  }
}

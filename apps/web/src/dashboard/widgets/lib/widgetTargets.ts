import type { WidgetData } from '../useWidgetData'

export type TargetKind = 'routine' | 'camera' | 'room'
export type TargetOption = { id: string; name: string }

const PLURAL: Record<TargetKind, string> = { routine: 'routines', camera: 'cameras', room: 'rooms' }

/** What a widget of this target kind can point at, by name. */
export function targetOptions(kind: TargetKind, data: WidgetData): TargetOption[] {
  const list = kind === 'routine' ? data.routines : kind === 'camera' ? data.cameras : data.rooms
  return list.map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

/** "Choose a routine". */
export const targetTitle = (kind: TargetKind) => `Choose a ${kind}`

/** "No cameras to show." */
export const noTargets = (kind: TargetKind) => `No ${PLURAL[kind]} to show.`

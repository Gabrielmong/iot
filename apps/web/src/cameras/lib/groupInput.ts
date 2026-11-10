import type { RoutineScope } from '../../gql/graphql'
import type { CameraGroupInput } from '../types'
import type { Layout } from './gridLayout'

export const MAX_GROUP_CAMERAS = 16
const MAX_NAME = 40

/** A group being saved: from the current view (Save as / Update) or the settings dialog. */
export type GroupDraft = { name: string; scope: RoutineScope; layout: Layout | number; cameraIds: string[]; audience: string[] }

export function groupInput(d: GroupDraft): CameraGroupInput {
  return { name: d.name.trim(), scope: d.scope, layout: d.layout, cameraIds: d.cameraIds, audience: d.scope === 'SHARED' ? d.audience : null }
}

/** Mirrors the server's rules so Save can explain what's wrong; [] when it's ready. */
export function groupErrors(d: GroupDraft): string[] {
  const errors: string[] = []
  const name = d.name.trim()
  if (!name) errors.push('Give the group a name')
  else if (name.length > MAX_NAME) errors.push(`Group name must be 1-${MAX_NAME} characters`)
  if (d.cameraIds.length === 0 || d.cameraIds.length > MAX_GROUP_CAMERAS) errors.push(`A group needs 1 to ${MAX_GROUP_CAMERAS} cameras`)
  return errors
}

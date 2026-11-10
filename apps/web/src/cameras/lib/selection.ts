import { isLayout, type Layout } from './gridLayout'

/** What the grid shows: cameras in order, the layout, and the group it came from (still highlighted after edits). */
export type Selection = { cameraIds: string[]; layout: Layout; groupId: string | null }
type GroupLike = { id: string; cameraIds: readonly string[]; layout: number }

const DEFAULT_LAYOUT: Layout = 4
const asLayout = (n: number): Layout => (isLayout(n) ? n : DEFAULT_LAYOUT)

/** Ticks or unticks a camera; new ones go last. */
export function toggleCamera(s: Selection, id: string): Selection {
  const cameraIds = s.cameraIds.includes(id) ? s.cameraIds.filter((c) => c !== id) : [...s.cameraIds, id]
  return { ...s, cameraIds }
}

export const selectGroup = (g: GroupLike): Selection => ({ cameraIds: [...g.cameraIds], layout: asLayout(g.layout), groupId: g.id })

/** Whether the view was changed after picking the group (cameras, their order, or layout). */
export function differsFromGroup(s: Selection, g: Omit<GroupLike, 'id'> | null): boolean {
  if (!g) return false
  return s.layout !== g.layout || s.cameraIds.length !== g.cameraIds.length || s.cameraIds.some((id, i) => id !== g.cameraIds[i])
}

/** The selected cameras the viewer can actually see, in order. */
export const visibleSelection = (s: Selection, visible: ReadonlySet<string>): string[] => s.cameraIds.filter((id) => visible.has(id))

/** Opening the page: the first personal group, else the first shared one, else nothing ticked. */
export function initialSelection(groups: { mine: readonly GroupLike[]; shared: readonly GroupLike[] }): Selection {
  const first = groups.mine[0] ?? groups.shared[0]
  return first ? selectGroup(first) : { cameraIds: [], layout: DEFAULT_LAYOUT, groupId: null }
}

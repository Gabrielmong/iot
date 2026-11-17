import type { TimelineEntry } from './buildTimeline'

/** What the log panel shows: a deploy history event, or a CI job. */
export type Selection = { kind: 'event'; id: string } | { kind: 'job'; id: string }

export const isSelected = (selection: Selection | null, kind: Selection['kind'], id: string) =>
  selection?.kind === kind && selection.id === id

/** Whether the selection sits on this card or row, so its log opens underneath (phones). */
export function holdsSelection(entry: TimelineEntry, selection: Selection | null): boolean {
  if (!selection) return false
  if (entry.type === 'action') return isSelected(selection, 'event', entry.event.id)
  if (selection.kind === 'event') return entry.attempts.some((e) => e.id === selection.id)
  return entry.runs.some((r) => r.jobs.some((j) => j.id === selection.id))
}

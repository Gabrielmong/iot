import type { CiJob, DeployEvent } from '../../data/useDeployStatus'
import type { TimelineEntry } from './buildTimeline'
import type { Selection } from './selection'

/** What a selection points at, found in the current entries. */
export type SelectionTarget = { kind: 'event'; event: DeployEvent } | { kind: 'job'; job: CiJob }

const eventsOf = (e: TimelineEntry): DeployEvent[] => (e.type === 'action' ? [e.event] : e.attempts)
const jobsOf = (e: TimelineEntry): CiJob[] => (e.type === 'action' ? [] : e.runs.flatMap((r) => r.jobs))

export function findTarget(entries: readonly TimelineEntry[], selection: Selection | null): SelectionTarget | null {
  if (!selection) return null
  if (selection.kind === 'event') {
    const event = entries.flatMap(eventsOf).find((e) => e.id === selection.id)
    return event ? { kind: 'event', event } : null
  }
  const job = entries.flatMap(jobsOf).find((j) => j.id === selection.id)
  return job ? { kind: 'job', job } : null
}

/**
 * The selection when nothing was picked: a running deploy event; else, on the newest entry, its newest
 * attempt, its first failed job, its newest job, or an action row's event.
 */
export function defaultSelection(entries: readonly TimelineEntry[]): Selection | null {
  const running = entries.flatMap(eventsOf).find((e) => e.status === 'RUNNING')
  if (running) return { kind: 'event', id: running.id }
  const first = entries[0]
  if (!first) return null
  if (first.type === 'action') return { kind: 'event', id: first.event.id }
  const attempt = first.attempts.at(-1)
  if (attempt) return { kind: 'event', id: attempt.id }
  const jobs = jobsOf(first)
  const job = jobs.find((j) => j.state === 'FAILED') ?? newestJob(jobs)
  return job ? { kind: 'job', id: job.id } : null
}

function newestJob(jobs: CiJob[]): CiJob | undefined {
  const started = (j: CiJob) => (j.startedAt ? Date.parse(j.startedAt) : Number.NEGATIVE_INFINITY)
  return jobs.reduce<CiJob | undefined>((best, j) => (!best || started(j) > started(best) ? j : best), undefined)
}

export const sameSelection = (a: Selection | null, b: Selection | null) => a?.kind === b?.kind && a?.id === b?.id

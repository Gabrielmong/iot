import type { CiRun, DeployCommit, DeployEvent } from '../../data/useDeployStatus'

/** The deploy stage's line when a commit has no deploy attempt yet. */
export type PendingDeploy = 'WAITING_FOR_TESTS' | 'SUPERSEDED' | 'WAITING_TO_DEPLOY' | null

export type CommitEntry = {
  type: 'commit'
  key: string
  sha: string
  message: string | null
  committedAt: string | null
  /** The deploy-gating workflow first, then by start. */
  runs: CiRun[]
  /** DEPLOY events (including SKIPPED) for this sha, oldest first. */
  attempts: DeployEvent[]
  pending: PendingDeploy
  running: boolean
  activityAt: string
}

export type ActionEntry = { type: 'action'; key: string; event: DeployEvent; activityAt: string }

export type TimelineEntry = CommitEntry | ActionEntry

type Input = { commits: readonly DeployCommit[]; events: readonly DeployEvent[]; runningSha: string | null }

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY)
const latest = (isos: Array<string | null | undefined>) =>
  isos.reduce<string>((best, iso) => (iso && time(iso) > time(best) ? iso : best), '')

const isAttempt = (e: DeployEvent) => e.kind === 'DEPLOY' && Boolean(e.sha)

const byGatingThenStart = (a: CiRun, b: CiRun) =>
  Number(b.gatesDeploy) - Number(a.gatesDeploy) || time(a.createdAt) - time(b.createdAt)

function gating(runs: CiRun[]): 'unfinished' | 'green' | 'other' {
  const gate = runs.filter((r) => r.gatesDeploy)
  if (gate.some((r) => r.state === 'QUEUED' || r.state === 'RUNNING')) return 'unfinished'
  if (gate.length > 0 && gate.every((r) => r.state === 'SUCCEEDED' || r.state === 'SKIPPED')) return 'green'
  return 'other'
}

/**
 * The first rule that matches (spec): unfinished tests; green but older than the running commit
 * (the deployer only looks at newer ones, so it will never deploy it); green; otherwise nothing.
 */
function pendingFor(card: Omit<CommitEntry, 'pending' | 'activityAt'>, runningCommittedAt: string | null): PendingDeploy {
  if (card.attempts.length > 0 || card.running) return null
  const state = gating(card.runs)
  if (state === 'unfinished') return 'WAITING_FOR_TESTS'
  if (state !== 'green') return null
  if (runningCommittedAt && card.committedAt && time(card.committedAt) < time(runningCommittedAt)) return 'SUPERSEDED'
  return 'WAITING_TO_DEPLOY'
}

/** Deploy history and CI runs as one list, newest activity first: a card per commit, a row per other action. */
export function buildTimeline({ commits, events, runningSha }: Input): TimelineEntry[] {
  const shas = new Set<string>([...commits.map((c) => c.sha), ...events.filter(isAttempt).map((e) => e.sha!)])
  const runningCommittedAt = commits.find((c) => c.sha === runningSha)?.committedAt ?? null

  const cards: CommitEntry[] = [...shas].map((sha) => {
    const commit = commits.find((c) => c.sha === sha)
    const attempts = events.filter((e) => isAttempt(e) && e.sha === sha).sort((a, b) => time(a.startedAt) - time(b.startedAt))
    const runs = [...(commit?.runs ?? [])].sort(byGatingThenStart)
    const card = {
      type: 'commit' as const,
      key: `commit:${sha}`,
      sha,
      message: commit?.message ?? attempts.find((e) => e.message)?.message ?? null,
      committedAt: commit?.committedAt ?? null,
      runs,
      attempts,
      running: sha === runningSha,
    }
    const activityAt = latest([
      card.committedAt,
      ...runs.map((r) => r.updatedAt),
      ...attempts.flatMap((e) => [e.startedAt, e.finishedAt]),
    ])
    return { ...card, pending: pendingFor(card, runningCommittedAt), activityAt }
  })

  const actions: ActionEntry[] = events
    .filter((e) => !isAttempt(e))
    .map((event) => ({ type: 'action', key: `event:${event.id}`, event, activityAt: latest([event.startedAt, event.finishedAt]) }))

  return [...cards, ...actions].sort((a, b) => time(b.activityAt) - time(a.activityAt))
}

import type { CiJob, CiRun, DeployCommit, DeployEvent, DeployStatus } from '../admin/data/useDeployStatus'

export function deployEventFixture(o: Partial<DeployEvent> = {}): DeployEvent {
  return {
    id: 'e1',
    kind: 'DEPLOY',
    status: 'SUCCEEDED',
    sha: 'abc1234def5678',
    message: 'Tidy the rooms page',
    by: 'auto',
    startedAt: '2026-11-10T12:00:00.000Z',
    finishedAt: '2026-11-10T12:03:10.000Z',
    detail: null,
    canRollback: false,
    rollbackBlockedReason: null,
    ...o,
  }
}

export function deployStatusFixture(o: Partial<DeployStatus> = {}): DeployStatus {
  return {
    available: true,
    running: { sha: 'abc1234def5678', message: 'Tidy the rooms page', deployedAt: new Date(Date.now() - 12 * 60_000).toISOString() },
    autoDeploy: true,
    pausedReason: null,
    lastCheckAt: new Date(Date.now() - 60_000).toISOString(),
    lastCheckError: null,
    busy: null,
    helperUpdateAvailable: false,
    events: [deployEventFixture()],
    commits: [],
    ciError: null,
    ciCheckedAt: null,
    ...o,
  }
}

export function ciJobFixture(o: Partial<CiJob> = {}): CiJob {
  return {
    id: '21',
    name: 'test',
    state: 'SUCCEEDED',
    startedAt: '2026-11-10T11:56:00.000Z',
    completedAt: '2026-11-10T11:59:30.000Z',
    url: 'https://github.com/o/r/actions/runs/11/job/21',
    steps: [
      { number: 1, name: 'Set up job', state: 'SUCCEEDED', startedAt: '2026-11-10T11:56:00.000Z', completedAt: '2026-11-10T11:56:02.000Z' },
      { number: 2, name: 'pnpm test', state: 'SUCCEEDED', startedAt: '2026-11-10T11:56:02.000Z', completedAt: '2026-11-10T11:59:30.000Z' },
    ],
    ...o,
  }
}

export function ciRunFixture(o: Partial<CiRun> = {}): CiRun {
  return {
    id: '11',
    attempt: 1,
    workflow: 'CI',
    gatesDeploy: true,
    state: 'SUCCEEDED',
    createdAt: '2026-11-10T11:55:30.000Z',
    updatedAt: '2026-11-10T11:59:40.000Z',
    url: 'https://github.com/o/r/actions/runs/11',
    jobs: [ciJobFixture()],
    ...o,
  }
}

export function deployCommitFixture(o: Partial<DeployCommit> = {}): DeployCommit {
  return {
    sha: 'abc1234def5678',
    message: 'Tidy the rooms page',
    committedAt: '2026-11-10T11:55:00.000Z',
    runs: [ciRunFixture()],
    ...o,
  }
}

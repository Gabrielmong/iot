import type { DeployEvent, DeployStatus } from '../admin/data/useDeployStatus'

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
    ...o,
  }
}

import { ciRunFixture, deployCommitFixture, deployEventFixture } from '../../../test/deployFixtures'
import { buildTimeline } from './buildTimeline'

const A = 'aaaaaaa1111111'
const B = 'bbbbbbb2222222'

const commitA = deployCommitFixture({ sha: A, message: 'A', committedAt: '2026-11-10T10:00:00.000Z', runs: [ciRunFixture({ updatedAt: '2026-11-10T10:05:00.000Z' })] })
const commitB = deployCommitFixture({ sha: B, message: 'B', committedAt: '2026-11-10T11:00:00.000Z', runs: [ciRunFixture({ id: '12', updatedAt: '2026-11-10T11:05:00.000Z' })] })

const deployOf = (sha: string, o: Parameters<typeof deployEventFixture>[0] = {}) =>
  deployEventFixture({ id: `d-${sha}`, sha, startedAt: '2026-11-10T11:10:00.000Z', finishedAt: '2026-11-10T11:13:00.000Z', ...o })

describe('buildTimeline', () => {
  it('CI-only commit becomes a card with runs, gating first', () => {
    const android = ciRunFixture({ id: '13', workflow: 'Android', gatesDeploy: false, createdAt: '2026-11-10T09:59:00.000Z' })
    const [entry] = buildTimeline({ commits: [{ ...commitA, runs: [android, ...commitA.runs] }], events: [], runningSha: null })
    expect(entry).toMatchObject({ type: 'commit', key: `commit:${A}`, sha: A, message: 'A', attempts: [], running: false })
    expect(entry.type === 'commit' && entry.runs.map((r) => r.workflow)).toEqual(['CI', 'Android'])
  })

  it('deploy event without CI data becomes a card with no runs', () => {
    const ev = deployOf(A, { message: 'From history' })
    const [entry] = buildTimeline({ commits: [], events: [ev], runningSha: null })
    expect(entry).toMatchObject({ type: 'commit', sha: A, message: 'From history', committedAt: null, runs: [], attempts: [ev], pending: null })
  })

  it('DEPLOY and SKIPPED events join the card by exact sha; ROLLBACK, RESTART and PAUSE stay action rows', () => {
    const skipped = deployOf(A, { id: 's1', status: 'SKIPPED', startedAt: '2026-11-10T10:06:00.000Z', finishedAt: null })
    const deployed = deployOf(A, { id: 'd1' })
    const rollback = deployEventFixture({ id: 'r1', kind: 'ROLLBACK', sha: A, startedAt: '2026-11-10T12:00:00.000Z', finishedAt: '2026-11-10T12:00:00.000Z' })
    const restart = deployEventFixture({ id: 'x1', kind: 'RESTART', sha: null, message: null, startedAt: '2026-11-10T12:30:00.000Z', finishedAt: '2026-11-10T12:30:00.000Z' })
    const pause = deployEventFixture({ id: 'p1', kind: 'PAUSE', sha: null, message: null, startedAt: '2026-11-10T09:00:00.000Z', finishedAt: '2026-11-10T09:00:00.000Z' })
    const prefix = deployOf(A.slice(0, 7), { id: 'short', startedAt: '2026-11-10T11:20:00.000Z', finishedAt: '2026-11-10T11:21:00.000Z' })
    const entries = buildTimeline({ commits: [commitA], events: [deployed, rollback, skipped, restart, pause, prefix], runningSha: null })
    expect(entries.map((e) => e.key)).toEqual(['event:x1', 'event:r1', `commit:${A.slice(0, 7)}`, `commit:${A}`, 'event:p1'])
    const card = entries.find((e) => e.key === `commit:${A}`)
    expect(card?.type === 'commit' && card.attempts.map((e) => e.id)).toEqual(['s1', 'd1'])
  })

  it('waiting for tests while the gating run is unfinished', () => {
    const c = { ...commitB, runs: [ciRunFixture({ state: 'RUNNING' })] }
    expect(buildTimeline({ commits: [c], events: [], runningSha: null })[0]).toMatchObject({ pending: 'WAITING_FOR_TESTS' })
  })

  it('waiting to deploy when green with no attempt and not older than the running commit', () => {
    const entries = buildTimeline({ commits: [commitA, commitB], events: [], runningSha: A })
    expect(entries.find((e) => e.key === `commit:${B}`)).toMatchObject({ pending: 'WAITING_TO_DEPLOY' })
    expect(entries.find((e) => e.key === `commit:${A}`)).toMatchObject({ pending: null, running: true }) // running already: nothing to wait for
  })

  it('superseded when green, never attempted and older than the running commit', () => {
    const entries = buildTimeline({ commits: [commitA, commitB], events: [deployOf(B)], runningSha: B })
    expect(entries.find((e) => e.key === `commit:${A}`)).toMatchObject({ pending: 'SUPERSEDED' })
    expect(entries.find((e) => e.key === `commit:${B}`)).toMatchObject({ pending: null, running: true })
  })

  it("no label when the running commit's committedAt is unknown", () => {
    const entries = buildTimeline({ commits: [commitA], events: [], runningSha: 'zzzzzzz' })
    expect(entries[0]).toMatchObject({ pending: 'WAITING_TO_DEPLOY' })
    const failed = { ...commitA, runs: [ciRunFixture({ state: 'FAILED' })] }
    expect(buildTimeline({ commits: [failed], events: [], runningSha: null })[0]).toMatchObject({ pending: null })
  })

  it("a re-deploy today moves an old commit's card to the top", () => {
    const redeploy = deployOf(A, { id: 'again', startedAt: '2026-11-12T08:00:00.000Z', finishedAt: '2026-11-12T08:03:00.000Z' })
    const entries = buildTimeline({ commits: [commitA, commitB], events: [redeploy], runningSha: A })
    expect(entries.map((e) => e.key)).toEqual([`commit:${A}`, `commit:${B}`])
    expect(entries[0].activityAt).toBe('2026-11-12T08:03:00.000Z')
  })

  it('running marks the card whose sha is runningSha', () => {
    const entries = buildTimeline({ commits: [commitA, commitB], events: [], runningSha: B })
    expect(entries.map((e) => e.type === 'commit' && e.running)).toEqual([true, false])
  })
})

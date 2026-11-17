import { act, renderHook } from '@testing-library/react'
import { ciJobFixture, ciRunFixture, deployCommitFixture, deployEventFixture } from '../../test/deployFixtures'
import type { DeployCommit, DeployEvent } from '../data/useDeployStatus'
import { buildTimeline } from './timeline/buildTimeline'
import { useLogSelection } from './useLogSelection'

const entries = (commits: DeployCommit[], events: DeployEvent[] = []) => buildTimeline({ commits, events, runningSha: null })

const OLD_SHA = '1111111aaaaaaa'
const deployed = deployEventFixture({ id: 'd-old', sha: OLD_SHA, startedAt: '2026-11-10T09:00:00.000Z', finishedAt: '2026-11-10T09:03:00.000Z' })
const failedCard = deployCommitFixture({
  committedAt: '2026-11-10T11:55:00.000Z',
  runs: [ciRunFixture({ state: 'FAILED', jobs: [ciJobFixture({ id: '21', name: 'lint' }), ciJobFixture({ id: '22', name: 'test', state: 'FAILED' })] })],
})

describe('useLogSelection', () => {
  it('defaults to the running deploy', () => {
    const running = deployEventFixture({ id: 'r', sha: OLD_SHA, status: 'RUNNING', startedAt: '2026-11-10T09:00:00.000Z', finishedAt: null })
    const { result } = renderHook(() => useLogSelection(entries([failedCard], [running]), false))
    expect(result.current.selected).toEqual({ kind: 'event', id: 'r' })
  })

  it('else the first failed job of the newest card', () => {
    const { result } = renderHook(() => useLogSelection(entries([failedCard], [deployed]), false))
    expect(result.current.selected).toEqual({ kind: 'job', id: '22' })
  })

  it("else the newest card's newest attempt, else its newest job, else an action row's event", () => {
    const attempt = deployEventFixture({ id: 'd1' })
    expect(renderHook(() => useLogSelection(entries([deployCommitFixture()], [attempt]), false)).result.current.selected).toEqual({ kind: 'event', id: 'd1' })
    expect(renderHook(() => useLogSelection(entries([deployCommitFixture()]), false)).result.current.selected).toEqual({ kind: 'job', id: '21' })
    const restart = deployEventFixture({ id: 'x', kind: 'RESTART', sha: null })
    expect(renderHook(() => useLogSelection(entries([], [restart]), false)).result.current.selected).toEqual({ kind: 'event', id: 'x' })
    expect(renderHook(() => useLogSelection([], false)).result.current.selected).toBeNull()
  })

  it('a picked job stays selected across updates', () => {
    const { result, rerender } = renderHook(({ e }) => useLogSelection(e, false), { initialProps: { e: entries([failedCard], [deployed]) } })
    act(() => result.current.select({ kind: 'job', id: '21' }))
    expect(result.current.selected).toEqual({ kind: 'job', id: '21' })
    const running = deployEventFixture({ id: 'r', sha: OLD_SHA, status: 'RUNNING', finishedAt: null })
    rerender({ e: entries([failedCard], [running]) })
    expect(result.current.selected).toEqual({ kind: 'job', id: '21' })
  })

  it('a picked selection that disappears falls back to the default', () => {
    const { result, rerender } = renderHook(({ e }) => useLogSelection(e, false), { initialProps: { e: entries([failedCard], [deployed]) } })
    act(() => result.current.select({ kind: 'event', id: 'd-old' }))
    rerender({ e: entries([failedCard]) })
    expect(result.current.selected).toEqual({ kind: 'job', id: '22' })
  })

  it('keeps the open selection on desktop when tapped again', () => {
    const { result } = renderHook(() => useLogSelection(entries([failedCard]), false))
    act(() => result.current.select({ kind: 'job', id: '22' }))
    expect(result.current.selected).toEqual({ kind: 'job', id: '22' })
  })

  it('phones: tapping the open selection closes it, and the next tap reopens it', () => {
    const { result } = renderHook(() => useLogSelection(entries([failedCard]), true))
    act(() => result.current.select({ kind: 'job', id: '22' }))
    expect(result.current.selected).toBeNull()
    act(() => result.current.select({ kind: 'job', id: '22' }))
    expect(result.current.selected).toEqual({ kind: 'job', id: '22' })
  })
})

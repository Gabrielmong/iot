import { fireEvent, render, screen, within } from '@testing-library/react'
import { ciJobFixture, ciRunFixture, deployCommitFixture, deployEventFixture } from '../../../test/deployFixtures'
import type { DeployCommit, DeployEvent } from '../../data/useDeployStatus'
import { buildTimeline, type CommitEntry } from './buildTimeline'
import { CommitCard } from './CommitCard'

function card(commit: Partial<DeployCommit> = {}, events: DeployEvent[] = [], runningSha: string | null = null): CommitEntry {
  const entry = buildTimeline({ commits: [deployCommitFixture(commit)], events, runningSha }).find((e) => e.type === 'commit')
  return entry as CommitEntry
}

function renderCard(entry: CommitEntry, o: { paused?: boolean; onSelect?: () => void; onRollback?: () => void } = {}) {
  return render(
    <CommitCard
      entry={entry}
      selection={null}
      paused={o.paused ?? false}
      disabled={false}
      onSelect={o.onSelect ?? (() => {})}
      onRollback={o.onRollback ?? (() => {})}
    />,
  )
}

const runningJob = ciJobFixture({ state: 'RUNNING', completedAt: null, steps: [{ number: 1, name: 'pnpm test', state: 'RUNNING', startedAt: null, completedAt: null }] })

describe('CommitCard', () => {
  it('shows the commit and a running chip', () => {
    renderCard(card({}, [], 'abc1234def5678'))
    expect(screen.getByText('abc1234')).toBeInTheDocument()
    expect(screen.getByText('Tidy the rooms page')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('a running CI run is expanded and shows its jobs and steps', () => {
    renderCard(card({ runs: [ciRunFixture({ state: 'RUNNING', jobs: [runningJob] })] }))
    expect(screen.getByRole('button', { name: /CI/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('test')).toBeInTheDocument()
    expect(screen.getByText('pnpm test')).toBeInTheDocument()
  })

  it('a green run is collapsed and expands on click', () => {
    renderCard(card())
    const toggle = screen.getByRole('button', { name: /CI/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('pnpm test')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('pnpm test')).toBeInTheDocument()
  })

  it('a failed run starts expanded', () => {
    renderCard(card({ runs: [ciRunFixture({ state: 'FAILED', jobs: [ciJobFixture({ state: 'FAILED' })] })] }))
    expect(screen.getByRole('button', { name: /CI/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('a non-gating run says "doesn\'t block deploy" and links to GitHub', () => {
    renderCard(card({ runs: [ciRunFixture(), ciRunFixture({ id: '12', workflow: 'Android', gatesDeploy: false, url: 'https://gh/android' })] }))
    expect(screen.getByText("doesn't block deploy")).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: 'Open in GitHub' })
    expect(links.map((l) => l.getAttribute('href'))).toContain('https://gh/android')
  })

  it('attempt 2 is labelled', () => {
    renderCard(card({ runs: [ciRunFixture({ attempt: 2 })] }))
    expect(screen.getByText('attempt 2')).toBeInTheDocument()
  })

  it.each<[string, Partial<DeployCommit>, boolean]>([
    ['Waiting for tests', { runs: [ciRunFixture({ state: 'RUNNING', jobs: [] })] }, false],
    ['Waiting to deploy', {}, false],
    ['Waiting to deploy (auto-deploy paused)', {}, true],
  ])('pending line reads "%s"', (text, commit, paused) => {
    renderCard(card(commit), { paused })
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('pending line reads "Superseded"', () => {
    const newer = deployCommitFixture({ sha: 'fff0000aaaa', committedAt: '2026-11-10T13:00:00.000Z' })
    const entries = buildTimeline({ commits: [deployCommitFixture(), newer], events: [], runningSha: newer.sha })
    renderCard(entries.find((e) => e.key === 'commit:abc1234def5678') as CommitEntry)
    expect(screen.getByText('Superseded')).toBeInTheDocument()
  })

  it("clicking a job calls onSelect({ kind: 'job', id })", () => {
    const onSelect = vi.fn()
    renderCard(card({ runs: [ciRunFixture({ state: 'RUNNING', jobs: [runningJob] })] }), { onSelect })
    fireEvent.click(screen.getByRole('button', { name: /test/ }))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'job', id: '21' })
  })

  it('a deploy attempt is selectable and keeps "Roll back to this"', () => {
    const onSelect = vi.fn()
    const onRollback = vi.fn()
    const attempt = deployEventFixture({ id: 'd1', canRollback: true })
    renderCard(card({}, [attempt]), { onSelect, onRollback })
    expect(screen.queryByText(/Waiting/)).not.toBeInTheDocument()
    const row = screen.getByRole('button', { name: /Deployed/ })
    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalledWith({ kind: 'event', id: 'd1' })
    fireEvent.click(within(row.parentElement!).getByRole('button', { name: 'Roll back to this' }))
    expect(onRollback).toHaveBeenCalledWith(attempt)
  })
})

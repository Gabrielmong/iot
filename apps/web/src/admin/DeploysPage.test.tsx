import type { ApolloLink } from '@apollo/client/link'
import { ApolloProvider } from '@apollo/client/react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { of, Subject, throwError } from 'rxjs'
import { ciJobFixture, ciRunFixture, deployCommitFixture, deployEventFixture, deployStatusFixture } from '../test/deployFixtures'
import { createTestClient, type Handler, reply } from '../test/testClient'
import { DeploysPage } from './DeploysPage'
import type { DeployStatus } from './data/useDeployStatus'

const OLD = deployEventFixture({ id: 'e1' })
const NEWER = deployEventFixture({
  id: 'e2',
  sha: '9be3a25ffff0000',
  message: 'Android TV unpairing',
  status: 'SKIPPED',
  startedAt: '2026-11-10T13:00:00.000Z',
  finishedAt: null,
  detail: 'tests red on GitHub',
})

function setup(statusHandler: Handler, extra: Record<string, Handler> = {}) {
  const client = createTestClient({
    DeployStatus: statusHandler,
    DeployLog: (op) => reply({ deployLog: `log of ${op.variables.eventId}` })(op),
    CiJobLog: (op) => reply({ ciJobLog: `job log ${op.variables.jobId}` })(op),
    ...extra,
  })
  render(
    <ApolloProvider client={client}>
      <DeploysPage />
    </ApolloProvider>,
  )
}

const statusReply = (o: Partial<DeployStatus> = {}): Handler => reply({ deployStatus: deployStatusFixture(o) })

describe('DeploysPage', () => {
  it('shows the running version and auto-deploy state', async () => {
    setup(statusReply({ pausedReason: 'rolled back to abc1234', autoDeploy: false }))
    expect((await screen.findAllByText('abc1234')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tidy the rooms page', { exact: false }).length).toBeGreaterThan(0)
    expect(screen.getByText('Auto-deploy paused: rolled back to abc1234')).toBeInTheDocument()
    expect(screen.getByText(/checked 1 min ago/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume auto-deploy' })).toBeInTheDocument()
  })

  it('says who paused auto-deploy without repeating "paused"', async () => {
    setup(statusReply({ pausedReason: 'paused by Admin', autoDeploy: false }))
    expect(await screen.findByText('Auto-deploy paused by Admin')).toBeInTheDocument()
  })

  it('shows the helper notice when unavailable', async () => {
    setup(statusReply({ available: false, running: null, events: [] }))
    expect(await screen.findByText(/The deploy helper isn't running on this computer/)).toBeInTheDocument()
    expect(screen.getByText(/See Deploying in docs\/RUNNING.md/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deploy now' })).not.toBeInTheDocument()
  })

  it('selecting an event shows its log', async () => {
    setup(statusReply({ events: [OLD, NEWER] }))
    expect(await screen.findByLabelText('Deploy log')).toHaveTextContent('log of e2')
    fireEvent.click(screen.getByText('Deployed'))
    await waitFor(() => expect(screen.getByLabelText('Deploy log')).toHaveTextContent('log of e1'))
  })

  it('deploy now sends the mutation and disables buttons while busy', async () => {
    let status = statusReply()
    const calls: string[] = []
    setup((op) => status(op), {
      DeployNow: (op) => {
        calls.push('deployNow')
        status = statusReply({ busy: 'Deploying 9be3a25' })
        return reply({ deployNow: 'e3' })(op)
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Deploy now' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deploy now' })).toBeDisabled())
    expect(calls).toEqual(['deployNow'])
    expect(screen.getByRole('button', { name: 'Restart app' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pause auto-deploy' })).toBeDisabled()
  })

  it('sends one mutation for a double click', async () => {
    const calls: string[] = []
    const response = new Subject<ApolloLink.Result>()
    setup(statusReply(), { DeployNow: () => { calls.push('deployNow'); return response } })
    const button = await screen.findByRole('button', { name: 'Deploy now' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(calls).toEqual(['deployNow'])
    await waitFor(() => expect(button).toBeDisabled())
    response.next({ data: { deployNow: 'e3' } })
    response.complete()
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('asks before restarting', async () => {
    const calls: string[] = []
    setup(statusReply(), { RestartApp: (op) => { calls.push('restart'); return reply({ restartApp: 'e3' })(op) } })
    fireEvent.click(await screen.findByRole('button', { name: 'Restart app' }))
    expect(calls).toEqual([])
    const dialog = await screen.findByRole('dialog', { name: 'Restart app?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect(calls).toEqual(['restart']))
  })

  it('rollback asks first, then sends the sha', async () => {
    const calls: unknown[] = []
    setup(statusReply({ events: [deployEventFixture({ canRollback: true })] }), {
      RollbackDeploy: (op) => { calls.push(op.variables); return reply({ rollbackDeploy: 'e4' })(op) },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Roll back to this' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Roll back to abc1234 — Tidy the rooms page? Auto-deploy will be paused.')
    expect(calls).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Roll back' }))
    await waitFor(() => expect(calls).toEqual([{ sha: 'abc1234def5678' }]))
  })

  it('blocked rollback is disabled with the reason', async () => {
    const reason = "Can't roll back past a database change; push a fix instead."
    setup(statusReply({ events: [deployEventFixture({ rollbackBlockedReason: reason })] }))
    const button = await screen.findByRole('button', { name: 'Roll back to this' })
    expect(button).toBeDisabled()
    fireEvent.mouseOver(button.parentElement as HTMLElement)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(reason)
  })

  it('shows a command error in a snackbar', async () => {
    setup(statusReply(), {
      DeployNow: () => of({ errors: [{ message: 'No green commit to deploy', extensions: { code: 'BAD_USER_INPUT' } }] }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Deploy now' }))
    expect(await screen.findByText('No green commit to deploy')).toBeInTheDocument()
  })

  it('clicking a finished job shows its CI log', async () => {
    const failed = ciRunFixture({ state: 'FAILED', jobs: [ciJobFixture({ state: 'FAILED' })] })
    setup(statusReply({ commits: [deployCommitFixture({ runs: [failed] })], events: [OLD] }))
    expect(await screen.findByLabelText('Deploy log')).toHaveTextContent('log of e1')
    fireEvent.click(screen.getByText('test'))
    await waitFor(() => expect(screen.getByLabelText('CI log')).toHaveTextContent('job log 21'))
    expect(screen.queryByLabelText('Deploy log')).not.toBeInTheDocument()
  })

  it('a job log that failed to load is fetched again when the job is reopened', async () => {
    const failed = ciRunFixture({ state: 'FAILED', jobs: [ciJobFixture({ state: 'FAILED' })] })
    let calls = 0
    setup(statusReply({ commits: [deployCommitFixture({ runs: [failed] })], events: [OLD] }), {
      CiJobLog: (op) => reply({ ciJobLog: calls++ === 0 ? null : 'job log 21' })(op),
    })
    expect(await screen.findByLabelText('Deploy log')).toHaveTextContent('log of e1')
    fireEvent.click(screen.getByText('test'))
    await waitFor(() => expect(screen.getByLabelText('CI log')).toHaveTextContent('No log for this job.'))
    fireEvent.click(screen.getByText('Deployed'))
    await screen.findByLabelText('Deploy log')
    fireEvent.click(screen.getByText('test'))
    await waitFor(() => expect(screen.getByLabelText('CI log')).toHaveTextContent('job log 21'))
  })

  it('a running job shows "Log is available when the job finishes"', async () => {
    const job = ciJobFixture({ state: 'RUNNING', completedAt: null })
    setup(statusReply({ commits: [deployCommitFixture({ runs: [ciRunFixture({ state: 'RUNNING', jobs: [job] })] })], events: [] }))
    expect(await screen.findByText('Log is available when the job finishes')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the job in GitHub' })).toHaveAttribute('href', job.url)
  })

  it('ciError shows "Can\'t read CI: …"', async () => {
    setup(statusReply({ ciError: 'GitHub rate limit, retrying at 12:30' }))
    expect(await screen.findByText("Can't read CI: GitHub rate limit, retrying at 12:30")).toBeInTheDocument()
  })

  it('a status without commits still shows deploy cards', async () => {
    setup(statusReply({ commits: [], events: [OLD, NEWER] }))
    const history = await screen.findByRole('list', { name: 'Deploy history' })
    expect(within(history).getByText('Deployed')).toBeInTheDocument()
    expect(within(history).getByText('Skipped', { selector: 'p' })).toBeInTheDocument()
    expect(within(history).getByText('9be3a25')).toBeInTheDocument()
  })
})

describe('DeploysPage on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('opens the log under the tapped row and closes it on a second tap', async () => {
    setup(statusReply({ events: [OLD, NEWER] }))
    const history = await screen.findByRole('list', { name: 'Deploy history' })
    await waitFor(() => expect(within(history).getByLabelText('Deploy log')).toHaveTextContent('log of e2'))

    fireEvent.click(screen.getByText('Deployed'))
    await waitFor(() => expect(within(history).getByLabelText('Deploy log')).toHaveTextContent('log of e1'))
    expect(screen.getAllByLabelText('Deploy log')).toHaveLength(1)

    fireEvent.click(screen.getByText('Deployed'))
    expect(screen.queryByLabelText('Deploy log')).not.toBeInTheDocument()
  })
})

describe('DeploysPage while the app restarts', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('shows restarting while the app is down mid-deploy', async () => {
    const polls = [
      statusReply({ busy: 'Deploying abc1234' }),
      () => throwError(() => new Error('Failed to fetch')),
      statusReply({ busy: null }),
    ]
    let n = 0
    setup((op) => polls[Math.min(n++, polls.length - 1)](op))

    expect(await screen.findByRole('button', { name: 'Deploy now' })).toBeDisabled()
    expect(screen.queryByText('Restarting…')).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(await screen.findByText('Restarting…')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't reach the server.")).not.toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1) // only the Restarting banner

    await act(() => vi.advanceTimersByTimeAsync(2000))
    await waitFor(() => expect(screen.queryByText('Restarting…')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Deploy now' })).toBeEnabled()
  })

  it('stops saying restarting 3 minutes after the last good status, and points at the docs', async () => {
    let n = 0
    setup((op) => (n++ === 0 ? statusReply({ busy: 'Deploying abc1234' })(op) : throwError(() => new Error('Failed to fetch'))))
    await screen.findByRole('button', { name: 'Deploy now' })
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(await screen.findByText('Restarting…')).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(170_000))
    expect(screen.getByText('Restarting…')).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(screen.queryByText('Restarting…')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      "The app hasn't come back. See 'When the app is down' in docs/RUNNING.md.",
    )
  })

  it('shows restarting when the restart request itself fails because the app went down', async () => {
    let down = false
    setup((op) => (down ? throwError(() => new Error('Failed to fetch')) : statusReply()(op)), {
      RestartApp: () => { down = true; return throwError(() => new Error('Failed to fetch')) },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Restart app' }))
    const dialog = await screen.findByRole('dialog', { name: 'Restart app?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restart' }))
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(await screen.findByText('Restarting…')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't reach the server.")).not.toBeInTheDocument()
  })

  it('fetches the log once more when the running event finishes', async () => {
    let finished = false
    let n = 0
    const running = deployEventFixture({ id: 'e5', status: 'RUNNING', finishedAt: null })
    setup(
      (op) => {
        if (n++ >= 1) { finished = true; return statusReply({ events: [{ ...running, status: 'SUCCEEDED' }] })(op) }
        return statusReply({ events: [running] })(op)
      },
      { DeployLog: (op) => reply({ deployLog: finished ? 'final line' : 'partial' })(op) },
    )
    expect(await screen.findByLabelText('Deploy log')).toHaveTextContent('partial')
    await act(() => vi.advanceTimersByTimeAsync(5000))
    await waitFor(() => expect(screen.getByLabelText('Deploy log')).toHaveTextContent('final line'))
  })
})

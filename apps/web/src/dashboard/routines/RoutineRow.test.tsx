import { ApolloProvider } from '@apollo/client/react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { of } from 'rxjs'
import { createTestClient, liveSubscription, reply } from '../../test/testClient'
import { routineFixture, runFixture } from '../../test/routineFixtures'
import { RoutineRow } from './RoutineRow'

const living = { id: 'r-living', name: 'Living room' }
const routines = [routineFixture({ id: 'a', name: 'Movie night', room: living }), routineFixture({ id: 'b', name: 'Bedtime' })]

function setup(tab: string, list = routines) {
  const runs = liveSubscription()
  const calls: unknown[] = []
  const client = createTestClient({
    Routines: reply({ routines: list }),
    RoutineRunChanged: runs.handler,
    RoutinesChanged: liveSubscription().handler,
    RunRoutine: (op) => {
      calls.push(op.variables)
      return of({ data: { runRoutine: true } })
    },
  })
  const view = render(
    <ApolloProvider client={client}>
      <RoutineRow tab={tab} devices={[]} onError={() => {}} />
    </ApolloProvider>,
  )
  return { runs, calls, view }
}

const runEvent = (routineId: string, run: ReturnType<typeof runFixture>) => ({
  routineRunChanged: { __typename: 'RoutineRunEvent', routineId, run },
})

describe('RoutineRow', () => {
  it("shows a room tab's routines, and all of them on All", async () => {
    setup('r-living')
    expect(await screen.findByRole('button', { name: 'Movie night' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bedtime' })).not.toBeInTheDocument()
  })

  it('shows every routine on All', async () => {
    setup('all')
    expect(await screen.findByRole('button', { name: 'Bedtime' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Movie night' })).toBeInTheDocument()
  })

  it('runs a routine on tap', async () => {
    const { calls } = setup('all')
    fireEvent.click(await screen.findByRole('button', { name: 'Movie night' }))
    await vi.waitFor(() => expect(calls).toEqual([{ id: 'a' }]))
  })

  it('shows progress while running and the problems after a partial run', async () => {
    const { runs } = setup('all')
    await screen.findByRole('button', { name: 'Movie night' })
    act(() => runs.next(runEvent('a', runFixture('RUNNING'))))
    expect(await screen.findByRole('progressbar', { name: 'Movie night is running' })).toBeInTheDocument()
    act(() => runs.next(runEvent('a', runFixture('PARTIAL', [{ deviceName: 'Lamp', reason: 'UNREACHABLE' }], 2))))
    fireEvent.click(await screen.findByRole('button', { name: 'Show problems with Movie night' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText("Lamp: couldn't reach it")).toBeInTheDocument()
    expect(within(dialog).getByText('2 other devices')).toBeInTheDocument()
  })

  it('opens the step details instead of restarting a running routine', async () => {
    const { runs, calls } = setup('all')
    await screen.findByRole('button', { name: 'Movie night' })
    act(() => runs.next(runEvent('a', runFixture('RUNNING', [], 0, { currentStep: 0 }))))
    await screen.findByRole('progressbar', { name: 'Movie night is running' })
    fireEvent.click(screen.getByRole('button', { name: 'Movie night' }))
    const dialog = await screen.findByRole('dialog', { name: 'Movie night' })
    expect(within(dialog).getByText('Now')).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('renders nothing when the tab has no routines', async () => {
    const { view } = setup('r-kitchen')
    await act(() => new Promise((r) => setTimeout(r, 20)))
    expect(view.container).toBeEmptyDOMElement()
  })
})

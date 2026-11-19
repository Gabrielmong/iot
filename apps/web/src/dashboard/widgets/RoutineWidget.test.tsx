import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { of } from 'rxjs'
import { routineFixture, runFixture } from '../../test/routineFixtures'
import { createTestClient } from '../../test/testClient'
import { RoutineWidget } from './RoutineWidget'

function setup(routine = routineFixture({ id: 'rt1', name: 'Movie night' })) {
  const calls = { run: [] as unknown[], stop: [] as unknown[] }
  const client = createTestClient({
    RunRoutine: (op) => {
      calls.run.push(op.variables)
      return of({ data: { runRoutine: true } })
    },
    StopRoutine: (op) => {
      calls.stop.push(op.variables)
      return of({ data: { stopRoutine: true } })
    },
  })
  render(
    <ApolloProvider client={client}>
      <RoutineWidget routine={routine} />
    </ApolloProvider>,
  )
  return calls
}

describe('RoutineWidget', () => {
  it('runs the routine when tapped', async () => {
    const calls = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Run Movie night' }))
    await vi.waitFor(() => expect(calls.run).toEqual([{ id: 'rt1' }]))
  })

  it('shows a running routine with a Stop button that stops it', async () => {
    const calls = setup(routineFixture({ id: 'rt1', name: 'Movie night', lastRun: runFixture('RUNNING') }))
    expect(screen.getByText('Running…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run Movie night' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stop Movie night' }))
    await vi.waitFor(() => expect(calls.stop).toEqual([{ id: 'rt1' }]))
  })
})

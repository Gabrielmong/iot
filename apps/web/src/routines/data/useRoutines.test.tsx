import { ApolloProvider } from '@apollo/client/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createTestClient, liveSubscription, reply } from '../../test/testClient'
import { routineFixture, runFixture } from '../../test/routineFixtures'
import { useRoutines } from './useRoutines'

function setup() {
  const runs = liveSubscription()
  const changed = liveSubscription()
  const client = createTestClient({
    Routines: reply({ routines: [routineFixture({ id: 'r1', name: 'Movie night' })] }),
    RoutineRunChanged: runs.handler,
    RoutinesChanged: changed.handler,
  })
  const wrapper = ({ children }: { children: ReactNode }) => <ApolloProvider client={client}>{children}</ApolloProvider>
  return { runs, ...renderHook(() => useRoutines(), { wrapper }) }
}

describe('useRoutines', () => {
  it('returns the routines and applies live run status', async () => {
    const { result, runs } = setup()
    await waitFor(() => expect(result.current.routines.map((r) => r.name)).toEqual(['Movie night']))
    expect(result.current.routines[0]!.lastRun).toBeNull()
    act(() => runs.next({ routineRunChanged: { __typename: 'RoutineRunEvent', routineId: 'r1', run: runFixture('RUNNING') } }))
    await waitFor(() => expect(result.current.routines[0]!.lastRun?.status).toBe('RUNNING'))
    act(() => runs.next({ routineRunChanged: { __typename: 'RoutineRunEvent', routineId: 'r1', run: runFixture('OK') } }))
    await waitFor(() => expect(result.current.routines[0]!.lastRun?.status).toBe('OK'))
  })
})

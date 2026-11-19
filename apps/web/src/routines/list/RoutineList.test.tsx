import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { of } from 'rxjs'
import { createTestClient, liveSubscription, reply } from '../../test/testClient'
import { routineFixture, runFixture, NO_CONDITION_FIELDS } from '../../test/routineFixtures'
import { RoutineList } from './RoutineList'

const living = { id: 'r-living', name: 'Living room' }
const mine = routineFixture({ id: 'a', name: 'Movie night', room: living, schedules: [{ time: '20:00', days: [5], enabled: true }] })
const shared = routineFixture({ id: 'b', name: 'Bedtime', scope: 'SHARED', editable: false })
const annsRoutine = routineFixture({ id: 'c', name: 'Wake up', owner: { id: 'ann', name: 'Ann', role: 'USER' } })

function setup(isAdmin: boolean, routines = [mine, shared], isGuest = false) {
  const calls = { run: [] as unknown[], stop: [] as unknown[], del: [] as unknown[] }
  const client = createTestClient({
    Routines: reply({ routines }),
    OtherRoutines: reply({ otherRoutines: [annsRoutine] }),
    RoutineRunChanged: liveSubscription().handler,
    RoutinesChanged: liveSubscription().handler,
    Devices: reply({ devices: [] }),
    DeviceState: liveSubscription().handler,
    DevicesChanged: liveSubscription().handler,
    Rooms: reply({ rooms: [] }),
    RunRoutine: (op) => {
      calls.run.push(op.variables)
      return of({ data: { runRoutine: true } })
    },
    StopRoutine: (op) => {
      calls.stop.push(op.variables)
      return of({ data: { stopRoutine: true } })
    },
    DeleteRoutine: (op) => {
      calls.del.push(op.variables)
      return of({ data: { deleteRoutine: true } })
    },
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <RoutineList isAdmin={isAdmin} isGuest={isGuest} />
      </MemoryRouter>
    </ApolloProvider>,
  )
  return calls
}

const section = (name: string) => screen.findByRole('region', { name })

describe('RoutineList', () => {
  it('lists my routines and shared ones; a user can run but not edit shared ones', async () => {
    setup(false)
    const my = await section('My routines')
    expect(within(my).getByText('Movie night')).toBeInTheDocument()
    expect(within(my).getByText('Living room · 20:00 Fri')).toBeInTheDocument()
    expect(within(my).getByRole('link', { name: 'Edit Movie night' })).toHaveAttribute('href', '/routines/a')
    const sharedSection = await section('Shared')
    expect(within(sharedSection).getByText('Whole house')).toBeInTheDocument()
    expect(within(sharedSection).getByRole('button', { name: 'Run Bedtime' })).toBeInTheDocument()
    expect(within(sharedSection).queryByRole('link', { name: 'Edit Bedtime' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Other users' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New routine' })).toHaveAttribute('href', '/routines/new')
  })

  it("shows admins other users' routines with the owner's name", async () => {
    setup(true)
    const others = await section('Other users')
    expect(within(others).getByText('Wake up')).toBeInTheDocument()
    expect(within(others).getByText(/Ann/)).toBeInTheDocument()
  })

  it('guests see shared routines without New routine', async () => {
    setup(false, [shared], true)
    const sharedSection = await section('Shared')
    expect(within(sharedSection).getByRole('button', { name: 'Run Bedtime' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New routine' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Edit / })).not.toBeInTheDocument()
  })

  it('runs, and stops a running routine', async () => {
    const running = routineFixture({ id: 'a', name: 'Movie night', lastRun: runFixture('RUNNING') })
    const calls = setup(false, [running, shared])
    fireEvent.click(await screen.findByRole('button', { name: 'Run Bedtime' }))
    fireEvent.click(within(await section('My routines')).getByRole('button', { name: 'Stop Movie night' }))
    await vi.waitFor(() => expect(calls.run).toEqual([{ id: 'b' }]))
    await vi.waitFor(() => expect(calls.stop).toEqual([{ id: 'a' }]))
  })

  it('confirms before deleting', async () => {
    const calls = setup(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Movie night' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(calls.del).toEqual([{ id: 'a' }]))
  })

  it('says when there are no routines yet', async () => {
    setup(false, [])
    expect(await screen.findByText('No routines yet.')).toBeInTheDocument()
  })

  it('lists running routines with their step, and opens the step details', async () => {
    const waitUntil = new Date(Date.now() + 12.5 * 60_000).toISOString()
    const running = routineFixture({ id: 'a', name: 'Movie night', lastRun: runFixture('RUNNING', [], 0, { currentStep: 1, waitUntil }) })
    running.steps.push({ ...NO_CONDITION_FIELDS, kind: 'WAIT', waitMinutes: 45, routineId: null, routineName: null, actions: [] })
    setup(false, [running, shared])
    const now = await section('Running now')
    expect(within(now).getByText('Step 2 of 2 · Waiting · 12 min left')).toBeInTheDocument()
    expect(within(now).queryByText('Bedtime')).not.toBeInTheDocument()
    fireEvent.click(within(now).getByRole('button', { name: 'Movie night details' }))
    expect(await screen.findByRole('dialog', { name: 'Movie night' })).toBeInTheDocument()
  })

  it('opens the step details from the full list too', async () => {
    setup(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Bedtime details' }))
    expect(await screen.findByRole('dialog', { name: 'Bedtime' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Running now' })).not.toBeInTheDocument()
  })
})

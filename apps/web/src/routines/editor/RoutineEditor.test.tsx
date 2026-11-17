import { ApolloProvider } from '@apollo/client/react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { of } from 'rxjs'
import { deviceFixture } from '../../test/deviceFixtures'
import { routineFixture, runFixture } from '../../test/routineFixtures'
import { createTestClient, liveSubscription, reply, type Handler } from '../../test/testClient'
import { RoutineEditorLoader } from './RoutineEditorLoader'

const living = { id: 'r1', name: 'Living room' }
const tv = deviceFixture({ id: 'tv', name: 'TV plug', kind: 'PLUG', room: living })
const ann = { __typename: 'User', id: 'ann', name: 'Ann', avatarColor: '#123456', avatarImage: null, role: 'USER' }
const root = { __typename: 'User', id: 'root', name: 'Root', avatarColor: '#654321', avatarImage: null, role: 'ADMIN' }

type Setup = { id?: string; isAdmin?: boolean; extra?: Record<string, Handler> }

function setup({ id, isAdmin = false, extra = {} }: Setup = {}) {
  const calls: Record<string, unknown[]> = { create: [], update: [], try: [], stopTry: [] }
  const runs = liveSubscription()
  const record = (name: string, data: Record<string, unknown>): Handler => (op) => {
    calls[name]!.push(op.variables)
    return of({ data })
  }
  const client = createTestClient({
    Devices: reply({ devices: [tv] }),
    Rooms: reply({ rooms: [{ __typename: 'Room', sortOrder: 0, ...living }] }),
    DeviceState: liveSubscription().handler,
    DevicesChanged: liveSubscription().handler,
    Users: reply({ users: [root, ann] }),
    Routines: reply({ routines: [] }),
    RoutineRunChanged: runs.handler,
    RoutinesChanged: liveSubscription().handler,
    CreateRoutine: record('create', { createRoutine: routineFixture({ id: 'new' }) }),
    UpdateRoutine: record('update', { updateRoutine: routineFixture({ id: id ?? 'x' }) }),
    TryRoutine: record('try', { tryRoutine: true }),
    StopTry: record('stopTry', { stopTry: true }),
    ...extra,
  })
  const view = render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={['/edit']}>
        <Routes>
          <Route path="/edit" element={<RoutineEditorLoader id={id ?? null} userId={isAdmin ? 'root' : 'ann'} isAdmin={isAdmin} />} />
          <Route path="/routines" element={<p>Routines list</p>} />
        </Routes>
      </MemoryRouter>
    </ApolloProvider>,
  )
  return { calls, runs, unmount: view.unmount }
}

async function addTvOn() {
  const step = await screen.findByRole('group', { name: /^Step 1/ })
  fireEvent.click(within(step).getByRole('button', { name: 'Add device' }))
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Pick a device' })).getByRole('button', { name: 'TV plug' }))
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'TV plug' })).getByRole('button', { name: 'Done' }))
}

describe('RoutineEditor', () => {
  it('creates a routine with a weekday schedule', async () => {
    const { calls } = setup()
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Movie night' } })
    await addTvOn()
    fireEvent.click(screen.getByRole('button', { name: 'Add time' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Routines list')).toBeInTheDocument()
    expect(calls.create).toEqual([
      {
        input: {
          name: 'Movie night',
          scope: 'PERSONAL',
          roomId: null,
          audience: null,
          steps: [{ kind: 'SET', actions: [{ deviceId: 'tv', on: true, brightness: null, color: null, colorTempK: null }] }],
          schedules: [{ time: '07:00', days: [1, 2, 3, 4, 5], enabled: true }],
        },
      },
    ])
  })

  it('offers TVs and computers; a computer can only be woken', async () => {
    const sala = deviceFixture({ id: 'sala', name: 'Sala TV', kind: 'TV', brand: 'ANDROID_TV', room: living })
    const pc = deviceFixture({ id: 'pc', name: 'Office PC', kind: 'COMPUTER', brand: 'WOL', room: living })
    setup({ extra: { Devices: reply({ devices: [tv, sala, pc] }) } })
    const step = await screen.findByRole('group', { name: /^Step 1/ })
    fireEvent.click(within(step).getByRole('button', { name: 'Add device' }))
    const picker = await screen.findByRole('dialog', { name: 'Pick a device' })
    expect(within(picker).getByRole('button', { name: 'Sala TV' })).toBeInTheDocument()
    fireEvent.click(within(picker).getByRole('button', { name: 'Office PC' }))
    const dialog = await screen.findByRole('dialog', { name: 'Office PC' })
    expect(within(dialog).getByRole('button', { name: 'Wake' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Off' })).toBeNull()
  })

  it('edits an existing routine', async () => {
    const existing = routineFixture({ id: 'r9', name: 'Bedtime', deviceIds: ['tv'] })
    const { calls } = setup({ id: 'r9', extra: { Routine: reply({ routine: existing }) } })
    const name = await screen.findByLabelText('Name')
    expect(name).toHaveValue('Bedtime')
    fireEvent.change(name, { target: { value: 'Night' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Routines list')
    expect(calls.update).toEqual([{ id: 'r9', input: expect.objectContaining({ name: 'Night' }) }])
  })

  it('tells the user when saved devices are gone', async () => {
    const existing = routineFixture({ id: 'r9', name: 'Bedtime', deviceIds: ['tv', 'gone'], removedIds: ['gone'] })
    setup({ id: 'r9', extra: { Routine: reply({ routine: existing }) } })
    expect(await screen.findByText('1 device in this routine was removed. Save to tidy it up.')).toBeInTheDocument()
  })

  it('shows not found for a missing routine', async () => {
    setup({ id: 'nope', extra: { Routine: reply({ routine: null }) } })
    expect(await screen.findByText('This routine doesn’t exist or isn’t yours to edit.')).toBeInTheDocument()
  })

  it('gives regular users no sharing options', async () => {
    setup()
    await screen.findByLabelText('Name')
    expect(screen.queryByRole('checkbox', { name: 'Shared routine' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Who can see it' })).not.toBeInTheDocument()
  })

  it('lets an admin share a new routine with chosen users', async () => {
    const { calls } = setup({ isAdmin: true })
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Evening' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Shared routine' }))
    const who = await screen.findByRole('group', { name: 'Who can see it' })
    expect(within(who).queryByRole('checkbox', { name: 'Root' })).not.toBeInTheDocument()
    fireEvent.click(within(who).getByRole('checkbox', { name: 'Ann' }))
    await addTvOn()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Routines list')
    expect(calls.create).toEqual([{ input: expect.objectContaining({ scope: 'SHARED', audience: ['ann'] }) }])
  })

  it('tries the draft and offers Stop while it runs', async () => {
    const { calls, runs } = setup()
    await screen.findByLabelText('Name')
    await addTvOn()
    fireEvent.click(screen.getByRole('button', { name: 'Try it' }))
    await vi.waitFor(() => expect(calls.try).toHaveLength(1))
    act(() => runs.next({ routineRunChanged: { __typename: 'RoutineRunEvent', routineId: 'try', run: runFixture('RUNNING') } }))
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument()
  })

  it('stops a Try it run when the editor closes', async () => {
    const { calls, unmount } = setup()
    await screen.findByLabelText('Name')
    await addTvOn()
    fireEvent.click(screen.getByRole('button', { name: 'Try it' }))
    await vi.waitFor(() => expect(calls.try).toHaveLength(1))
    unmount()
    await vi.waitFor(() => expect(calls.stopTry).toHaveLength(1))
  })

  it('explains why Save is disabled', async () => {
    setup()
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Empty' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('Add a device or a routine')).toBeInTheDocument()
  })
})

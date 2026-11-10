import type { ApolloLink } from '@apollo/client/link'
import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { of, Subject } from 'rxjs'
import { roomFixture } from '../test/adminFixtures'
import { createTestClient, type Handler, reply } from '../test/testClient'
import { RoomsPage } from './RoomsPage'

const kitchen = roomFixture('r1', 'Kitchen', 0)
const hall = roomFixture('r2', 'Hall', 1)

function setup(extra: Record<string, Handler> = {}) {
  let rooms = [kitchen, hall]
  const client = createTestClient({ Rooms: () => of({ data: { rooms } }), ...extra })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <RoomsPage />
      </MemoryRouter>
    </ApolloProvider>,
  )
  return { setRooms: (next: typeof rooms) => (rooms = next) }
}

describe('RoomsPage', () => {
  it('creates a room on Enter and ignores a second Enter while the request is pending', async () => {
    const response = new Subject<ApolloLink.Result>()
    const calls: unknown[] = []
    setup({ CreateRoom: (op) => { calls.push(op.variables); return response } })
    fireEvent.click(await screen.findByRole('button', { name: 'Add room' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add room' })
    const user = userEvent.setup()
    await user.type(within(dialog).getByLabelText('Room name'), 'Garage{Enter}{Enter}')
    expect(calls).toEqual([{ name: 'Garage' }])
    response.next({ data: { createRoom: roomFixture('r3', 'Garage', 2) } })
    response.complete()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('renames a room', async () => {
    const calls: unknown[] = []
    setup({ UpdateRoom: (op) => { calls.push(op.variables); return reply({ updateRoom: kitchen })(op) } })
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Kitchen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename Kitchen' })
    fireEvent.change(within(dialog).getByLabelText('Room name'), { target: { value: 'Galley' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls).toEqual([{ id: 'r1', name: 'Galley' }]))
  })

  it('deletes a room only after confirming', async () => {
    const calls: unknown[] = []
    const ctl = setup({
      DeleteRoom: (op) => {
        calls.push(op.variables)
        ctl.setRooms([hall])
        return reply({ deleteRoom: true })(op)
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Hall' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Hall?' })
    expect(within(dialog).getByText(/become unassigned/)).toBeInTheDocument()
    expect(calls).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(calls).toEqual([{ id: 'r2' }]))
  })

  it('disables the move buttons while a move is in flight', async () => {
    const response = new Subject<ApolloLink.Result>()
    const calls: unknown[] = []
    setup({ UpdateRoom: (op) => { calls.push(op.variables); return response } })
    fireEvent.click(await screen.findByRole('button', { name: 'Move Hall up' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move Kitchen down' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Move Hall up' })).toBeDisabled()
    expect(calls).toHaveLength(1)
    response.next({ data: { updateRoom: hall } })
    response.complete()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move Kitchen down' })).toBeEnabled())
  })
})

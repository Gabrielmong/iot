import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { setToken } from '../auth/session'
import { adminDeviceFixture, roomFixture, userFixture } from '../test/adminFixtures'
import { of } from 'rxjs'
import { createTestClient, type Handler, reply } from '../test/testClient'
import { UsersPage } from './UsersPage'
import { chooseOption } from '../test/chooseOption'

const kitchen = { __typename: 'Room' as const, id: 'r1', name: 'Kitchen' }
const hall = { __typename: 'Room' as const, id: 'r2', name: 'Hall' }
const devices = [
  adminDeviceFixture({ id: 'k1', name: 'Kettle', adopted: true, room: kitchen }),
  adminDeviceFixture({ id: 'k2', name: 'Toaster', adopted: true, room: kitchen }),
  adminDeviceFixture({ id: 'h1', name: 'Hall lamp', adopted: true, room: hall }),
  adminDeviceFixture({ id: 'n1', name: 'Fresh', adopted: false }),
]
const admin = userFixture('u1', 'Alice', 'ADMIN')
const bob = userFixture('u2', 'Bob')

function setup(extra: Record<string, Handler> = {}, grants: string[] = [], list = devices) {
  setToken('t')
  const client = createTestClient({
    Me: reply({ me: admin }),
    Users: reply({ users: [admin, bob] }),
    AdminDevices: reply({ adminDevices: list }),
    Rooms: reply({ rooms: [roomFixture('r1', 'Kitchen', 0), roomFixture('r2', 'Hall', 1)] }),
    Grants: reply({ grants }),
    ...extra,
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </ApolloProvider>,
  )
}

describe('UsersPage', () => {
  it('"all in room" checks every device in that room and setGrants gets exactly those ids', async () => {
    const calls: unknown[] = []
    setup({
      SetGrants: (op) => {
        calls.push(op.variables)
        return reply({ setGrants: ['k1', 'k2'] })(op)
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Device access for Bob' }))
    // the loading notice is replaced by the editor dialog once data arrives, so look up the dialog after
    fireEvent.click(await screen.findByRole('checkbox', { name: 'All in Kitchen' }))
    const dialog = screen.getByRole('dialog', { name: 'Device access for Bob' })
    expect(within(dialog).getByRole('checkbox', { name: 'Kettle' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Toaster' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Hall lamp' })).not.toBeChecked()
    expect(within(dialog).queryByText('Fresh')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(calls).toEqual([{ userId: 'u2', deviceIds: ['k1', 'k2'] }]))
  })

  it('shows implicit access instead of an editor for admins', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Device access for Alice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Device access for Alice' })
    expect(within(dialog).getByText(/Admins can operate every device/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('warns when a role change would sign the user out', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Bob' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Bob' })
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    await chooseOption('Role', 'Admin', dialog)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('signs Bob out on every device')
  })

  it('warns admins editing themselves that they will be signed out', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Alice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Alice' })
    fireEvent.change(within(dialog).getByLabelText(/^PIN/), { target: { value: '1234' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent("You'll be signed out")
  })

  it('keeps the PIN field empty and masked, and rejects a malformed PIN', async () => {
    const calls: unknown[] = []
    setup({ UpdateUser: (op) => { calls.push(op.variables); return reply({ updateUser: bob })(op) } })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Bob' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Bob' })
    const pin = within(dialog).getByLabelText(/^PIN/)
    expect(pin).toHaveValue('')
    expect(pin).toHaveAttribute('type', 'password')
    fireEvent.change(pin, { target: { value: '12' } })
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(calls).toEqual([])
  })

  it('saves only visible granted ids, dropping a hidden strip grant and an unlisted device', async () => {
    const calls: unknown[] = []
    const strip = adminDeviceFixture({ id: 'strip', name: 'Power strip', adopted: true, room: kitchen })
    const outlet = adminDeviceFixture({ id: 'o1', name: 'Coffee', adopted: true, parentId: 'strip', room: kitchen })
    setup(
      { SetGrants: (op) => { calls.push(op.variables); return reply({ setGrants: ['o1'] })(op) } },
      ['strip', 'gone', 'o1'],
      [strip, outlet],
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Device access for Bob' }))
    expect(await screen.findByRole('checkbox', { name: 'Coffee' })).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'Power strip' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(calls).toEqual([{ userId: 'u2', deviceIds: ['o1'] }]))
  })

  it('does not load grants for admins', async () => {
    let loads = 0
    setup({ Grants: (op) => { loads += 1; return reply({ grants: [] })(op) } })
    fireEvent.click(await screen.findByRole('button', { name: 'Device access for Alice' }))
    await screen.findByText(/Admins can operate every device/)
    expect(loads).toBe(0)
  })

  it('on a self role change, skips the refetch and shows no error when the session ends', async () => {
    let userLoads = 0
    const unauth = of({ errors: [{ message: 'Sign in required', extensions: { code: 'UNAUTHENTICATED' } }] })
    setup({
      Users: (op) => { userLoads += 1; return reply({ users: [admin, bob] })(op) },
      UpdateUser: () => unauth,
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Alice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Alice' })
    await chooseOption('Role', 'User', dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(userLoads).toBe(1)
  })

  it('does not refetch users after a successful self PIN change', async () => {
    let userLoads = 0
    setup({
      Users: (op) => { userLoads += 1; return reply({ users: [admin, bob] })(op) },
      UpdateUser: reply({ updateUser: admin }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Alice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Alice' })
    fireEvent.change(within(dialog).getByLabelText(/^PIN/), { target: { value: '4321' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(userLoads).toBe(1)
  })

  it('warns when deleting yourself and shows the last-admin refusal', async () => {
    setup({
      DeleteUser: () => of({ errors: [{ message: 'Cannot delete the last admin', extensions: { code: 'BAD_USER_INPUT' } }] }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alice' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Alice?' })
    expect(within(dialog).getByText(/You are deleting your own account/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await within(dialog).findByText('Cannot delete the last admin')).toBeInTheDocument()
  })

  describe('guests', () => {
    const guest = userFixture('u3', 'Gus', 'GUEST')
    const camera = adminDeviceFixture({ id: 'c1', name: 'Porch cam', kind: 'CAMERA', adopted: true, room: kitchen })
    const pc = adminDeviceFixture({ id: 'p1', name: 'Office PC', kind: 'COMPUTER', adopted: true, room: kitchen })

    it('creates a guest with no PIN', async () => {
      const calls: unknown[] = []
      setup({ CreateUser: (op) => { calls.push(op.variables); return reply({ createUser: guest })(op) } })
      fireEvent.click(await screen.findByRole('button', { name: 'Add user' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add user' })
      fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Gus' } })
      await chooseOption('Role', 'Guest', dialog)
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
      fireEvent.click(within(dialog).getByRole('checkbox', { name: 'No PIN' }))
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
      await vi.waitFor(() => expect(calls).toHaveLength(1))
      expect(calls[0]).toMatchObject({ name: 'Gus', role: 'GUEST' })
      expect(calls[0]).not.toHaveProperty('pin')
    })

    it('a user or admin still needs a PIN', async () => {
      setup()
      fireEvent.click(await screen.findByRole('button', { name: 'Add user' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add user' })
      fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Zed' } })
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
      expect(within(dialog).queryByRole('checkbox', { name: 'No PIN' })).not.toBeInTheDocument()
    })

    it('a PIN-less guest made a user must get a PIN', async () => {
      setup({ Users: reply({ users: [admin, bob, guest] }) })
      fireEvent.click(await screen.findByRole('button', { name: 'Edit Gus' }))
      const dialog = await screen.findByRole('dialog', { name: 'Edit Gus' })
      expect(within(dialog).getByLabelText(/^PIN \(leave blank to keep none\)/)).toBeInTheDocument()
      await chooseOption('Role', 'User', dialog)
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
      fireEvent.change(within(dialog).getByLabelText(/^PIN/), { target: { value: '1234' } })
      expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    })

    it('warns that becoming a guest removes cameras, computers, personal routines and camera groups', async () => {
      setup()
      fireEvent.click(await screen.findByRole('button', { name: 'Edit Bob' }))
      const dialog = await screen.findByRole('dialog', { name: 'Edit Bob' })
      await chooseOption('Role', 'Guest', dialog)
      expect(within(dialog).getByRole('alert')).toHaveTextContent("removes Bob's cameras, computers, personal routines and camera groups")
    })

    it('guest cards say Guest and No PIN', async () => {
      setup({ Users: reply({ users: [admin, bob, guest] }) })
      const card = (await screen.findByText('Gus')).closest('div')!.parentElement!
      expect(within(card).getByText('Guest')).toBeInTheDocument()
      expect(within(card).getByText('No PIN')).toBeInTheDocument()
    })

    it("a guest's device access hides cameras and computers", async () => {
      setup({ Users: reply({ users: [admin, bob, guest] }) }, [], [...devices, camera, pc])
      fireEvent.click(await screen.findByRole('button', { name: 'Device access for Gus' }))
      expect(await screen.findByRole('checkbox', { name: 'Kettle' })).toBeInTheDocument()
      expect(screen.queryByRole('checkbox', { name: 'Porch cam' })).not.toBeInTheDocument()
      expect(screen.queryByRole('checkbox', { name: 'Office PC' })).not.toBeInTheDocument()
    })
  })
})

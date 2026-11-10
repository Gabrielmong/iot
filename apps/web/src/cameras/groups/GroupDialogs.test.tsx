import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { of } from 'rxjs'
import { cameraGroupFixture, cameraGroupHandlers } from '../../test/cameraGroupFixtures'
import { deviceFixture } from '../../test/deviceFixtures'
import { createTestClient, failWith, liveSubscription, reply, type Handler } from '../../test/testClient'
import { CamerasView } from '../CamerasView'

vi.mock('../../device/camera/useLiveStream', () => ({
  useLiveStream: () => ({ transport: 'webrtc', phase: 'playing', attempt: 0 }),
}))

const cam = (id: string, name: string) => deviceFixture({ id, name, kind: 'CAMERA', brand: 'SWANN' })
const devices = [cam('door', 'Door'), cam('street', 'Street'), cam('garage', 'Garage')]
const users = [
  { __typename: 'User', id: 'root', name: 'Root', avatarColor: '#111111', avatarImage: null, role: 'ADMIN' },
  { __typename: 'User', id: 'ann', name: 'Ann', avatarColor: '#222222', avatarImage: null, role: 'USER' },
]

function setup({ groups = [] as ReturnType<typeof cameraGroupFixture>[], isAdmin = false, extra = {} as Record<string, Handler> } = {}) {
  const calls: Record<string, unknown[]> = { create: [], update: [], del: [] }
  const record = (name: string, data: Record<string, unknown>): Handler => (op) => {
    calls[name]!.push(op.variables)
    return of({ data })
  }
  const client = createTestClient({
    Devices: reply({ devices }),
    Rooms: reply({ rooms: [] }),
    DeviceState: liveSubscription().handler,
    DevicesChanged: liveSubscription().handler,
    Users: reply({ users }),
    ...cameraGroupHandlers(groups),
    CreateCameraGroup: record('create', { createCameraGroup: cameraGroupFixture({ id: 'new', name: 'Saved' }) }),
    UpdateCameraGroup: record('update', { updateCameraGroup: cameraGroupFixture({ id: 'g1' }) }),
    DeleteCameraGroup: record('del', { deleteCameraGroup: true }),
    ...extra,
  })
  render(
    <ApolloProvider client={client}>
      <CamerasView isAdmin={isAdmin} />
    </ApolloProvider>,
  )
  return calls
}

describe('camera group dialogs', () => {
  it('saves the ticked cameras and layout as a new group', async () => {
    const calls = setup()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Street' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Door' }))
    fireEvent.click(screen.getByRole('button', { name: '2 cameras' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save as group' }))
    const dialog = await screen.findByRole('dialog', { name: 'Save as group' })
    expect(within(dialog).queryByRole('checkbox', { name: 'Shared group' })).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Front' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() =>
      expect(calls.create).toEqual([{ input: { name: 'Front', scope: 'PERSONAL', layout: 2, cameraIds: ['street', 'door'], audience: null } }]),
    )
  })

  it('offers Update group once the view differs from the group', async () => {
    const calls = setup({ groups: [cameraGroupFixture({ id: 'g1', name: 'Front', cameraIds: ['door'] })] })
    await screen.findByRole('button', { name: 'Open Door' })
    expect(screen.queryByRole('button', { name: 'Update group' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Garage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update group' }))
    await vi.waitFor(() => expect(calls.update).toEqual([{ id: 'g1', input: expect.objectContaining({ name: 'Front', cameraIds: ['door', 'garage'] }) }]))
  })

  it('reorders and removes cameras in group settings', async () => {
    const calls = setup({ groups: [cameraGroupFixture({ id: 'g1', name: 'Front', cameraIds: ['door', 'street', 'garage'] })] })
    await screen.findByRole('button', { name: 'Open Door' })
    fireEvent.click(screen.getByRole('button', { name: 'Group settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Group settings' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move Street up' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Garage' }))
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Porch' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(calls.update).toEqual([{ id: 'g1', input: expect.objectContaining({ name: 'Porch', cameraIds: ['street', 'door'] }) }]))
  })

  it('confirms before deleting a group', async () => {
    const calls = setup({ groups: [cameraGroupFixture({ id: 'g1', name: 'Front', cameraIds: ['door'] })] })
    await screen.findByRole('button', { name: 'Open Door' })
    fireEvent.click(screen.getByRole('button', { name: 'Group settings' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Group settings' })).getByRole('button', { name: 'Delete group' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Delete Front?' })).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(calls.del).toEqual([{ id: 'g1' }]))
  })

  it("can't change a shared group a user can only view", async () => {
    setup({ groups: [cameraGroupFixture({ id: 'g1', name: 'Shared', scope: 'SHARED', editable: false, cameraIds: ['door'] })] })
    await screen.findByRole('button', { name: 'Open Door' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Garage' }))
    expect(screen.queryByRole('button', { name: 'Update group' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Group settings' })).not.toBeInTheDocument()
  })

  it('lets an admin share a new group with chosen users', async () => {
    const calls = setup({ isAdmin: true })
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Door' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save as group' }))
    const dialog = await screen.findByRole('dialog', { name: 'Save as group' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Everyone' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Shared group' }))
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Ann' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(calls.create).toEqual([{ input: expect.objectContaining({ scope: 'SHARED', audience: ['ann'] }) }]))
  })

  it("shows the server's message when saving fails", async () => {
    setup({ extra: { CreateCameraGroup: failWith('BAD_USER_INPUT') } })
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Door' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save as group' }))
    const dialog = await screen.findByRole('dialog', { name: 'Save as group' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Front' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('BAD_USER_INPUT')).toBeInTheDocument()
  })

  it('keeps the current view on screen while a new group is being saved', async () => {
    // The server's list doesn't have the new group yet when the save returns.
    setup({ groups: [cameraGroupFixture({ id: 'g1', name: 'Front', cameraIds: ['door'] })] })
    await screen.findByRole('button', { name: 'Open Door' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Street' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save as group' }))
    const dialog = await screen.findByRole('dialog', { name: 'Save as group' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Both' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryAllByRole('button', { name: /^Open / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Open Door', 'Open Street'])
  })

  it('only sends cameras the viewer can still see', async () => {
    const calls = setup({ groups: [cameraGroupFixture({ id: 'g1', name: 'Front', cameraIds: ['door', 'revoked'] })] })
    await screen.findByRole('button', { name: 'Open Door' })
    fireEvent.click(screen.getByRole('button', { name: '1 camera' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update group' }))
    await vi.waitFor(() => expect(calls.update).toEqual([{ id: 'g1', input: expect.objectContaining({ cameraIds: ['door'], layout: 1 }) }]))
    fireEvent.click(screen.getByRole('button', { name: 'Group settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Group settings' })
    expect(within(dialog).queryByText(/Camera$/)).not.toBeInTheDocument()
  })
})

import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { DeviceFieldsFragment } from '../gql/graphql'
import { cameraGroupFixture, cameraGroupHandlers } from '../test/cameraGroupFixtures'
import { deviceFixture } from '../test/deviceFixtures'
import { createTestClient, liveSubscription, reply } from '../test/testClient'
import { CamerasView } from './CamerasView'

vi.mock('../device/camera/useLiveStream', () => ({
  useLiveStream: () => ({ transport: 'webrtc', phase: 'playing', attempt: 0 }),
}))

const cam = (id: string, name: string) => deviceFixture({ id, name, kind: 'CAMERA', brand: 'SWANN' })
const street = cam('street', 'Street')
const door = cam('door', 'Door')
const garage = cam('garage', 'Garage')
const lamp = deviceFixture({ id: 'lamp', name: 'Lamp', kind: 'LIGHT' })

function setup({ devices = [street, door, garage, lamp] as DeviceFieldsFragment[], groups = [] as ReturnType<typeof cameraGroupFixture>[], isAdmin = false } = {}) {
  const client = createTestClient({
    Devices: reply({ devices }),
    Rooms: reply({ rooms: [] }),
    DeviceState: liveSubscription().handler,
    DevicesChanged: liveSubscription().handler,
    ...cameraGroupHandlers(groups, [cameraGroupFixture({ id: 'o1', name: 'Anns view', owner: { id: 'ann', name: 'Ann', role: 'USER' } })]),
  })
  render(
    <ApolloProvider client={client}>
      <CamerasView isAdmin={isAdmin} />
    </ApolloProvider>,
  )
}

const tileNames = () => screen.queryAllByRole('button', { name: /^Open / }).map((b) => b.getAttribute('aria-label'))

describe('CamerasView', () => {
  it('opens on the first personal group with its layout', async () => {
    setup({
      groups: [
        cameraGroupFixture({ id: 'g1', name: 'Front', cameraIds: ['door', 'street'], layout: 2 }),
        cameraGroupFixture({ id: 'g2', name: 'Shared one', scope: 'SHARED', cameraIds: ['garage'] }),
      ],
    })
    await vi.waitFor(() => expect(tileNames()).toEqual(['Open Door', 'Open Street']))
    expect(screen.getByRole('button', { name: '2 cameras' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Front' })).toHaveClass('Mui-selected')
  })

  it('ticking a camera adds it and keeps the group highlighted', async () => {
    setup({ groups: [cameraGroupFixture({ id: 'g1', name: 'Front', cameraIds: ['door'] })] })
    await vi.waitFor(() => expect(tileNames()).toEqual(['Open Door']))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Garage' }))
    expect(tileNames()).toEqual(['Open Door', 'Open Garage'])
    expect(screen.getByRole('button', { name: 'Front' })).toHaveClass('Mui-selected')
  })

  it('picking a shared group replaces the cameras', async () => {
    setup({
      groups: [
        cameraGroupFixture({ id: 'g1', name: 'Front', cameraIds: ['door'] }),
        cameraGroupFixture({ id: 'g2', name: 'Garage view', scope: 'SHARED', cameraIds: ['garage', 'street'], layout: 4 }),
      ],
    })
    await vi.waitFor(() => expect(tileNames()).toEqual(['Open Door']))
    fireEvent.click(within(screen.getByRole('region', { name: 'Shared' })).getByRole('button', { name: 'Garage view' }))
    expect(tileNames()).toEqual(['Open Garage', 'Open Street'])
  })

  it('lists only cameras in the checklist', async () => {
    setup()
    expect(await screen.findByRole('checkbox', { name: 'Street' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Lamp' })).not.toBeInTheDocument()
    expect(screen.getByText('Pick cameras or a group')).toBeInTheDocument()
  })

  it('says so when a group has no cameras the viewer can see', async () => {
    setup({ groups: [cameraGroupFixture({ id: 'g1', name: 'Hidden', cameraIds: [] })] })
    expect(await screen.findByText('No cameras you can see')).toBeInTheDocument()
  })

  it('says so when the user has no cameras at all', async () => {
    setup({ devices: [lamp] })
    expect(await screen.findByText("You don't have any cameras yet.")).toBeInTheDocument()
  })

  it("shows other users' groups to admins only", async () => {
    setup({ isAdmin: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Other users' }))
    expect(await screen.findByRole('button', { name: /Anns view/ })).toBeInTheDocument()
  })

  it('hides the Other users section from regular users', async () => {
    setup()
    await screen.findByRole('checkbox', { name: 'Street' })
    expect(screen.queryByRole('button', { name: 'Other users' })).not.toBeInTheDocument()
  })
})

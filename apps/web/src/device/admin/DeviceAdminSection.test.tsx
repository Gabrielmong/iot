import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { of } from 'rxjs'
import { setToken } from '../../auth/session'
import { adminDeviceFixture, roomFixture, userFixture } from '../../test/adminFixtures'
import { deviceFixture } from '../../test/deviceFixtures'
import { createTestClient, type Handler, liveSubscription, reply } from '../../test/testClient'
import { DevicePage } from '../../pages/DevicePage'

const detail = (extra: Record<string, unknown> = {}) => ({
  ...deviceFixture({ id: 'd1', name: 'Kettle', brand: 'TUYA', kind: 'PLUG' }),
  lastSeenAt: new Date().toISOString(),
  connection: 'LOCAL',
  streamSource: null,
  ip: null,
  model: 'SP10',
  ...extra,
})

const admin = userFixture('a1', 'Gabriel', 'ADMIN')
const ana = userFixture('u1', 'Ana')
const ben = userFixture('u2', 'Ben')

function setup(role: 'ADMIN' | 'USER', device: unknown, extra: Record<string, Handler> = {}) {
  setToken('t')
  const client = createTestClient({
    Me: reply({ me: role === 'ADMIN' ? admin : ana }),
    Device: reply({ device }),
    DeviceState: liveSubscription().handler,
    Rooms: reply({ rooms: [roomFixture('r1', 'Living room', 0)] }),
    AdminDevices: reply({ adminDevices: [adminDeviceFixture({ id: 'd1', adopted: true })] }),
    ...extra,
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={['/devices/d1']}>
        <Routes>
          <Route path="/devices/:id" element={<DevicePage />} />
          <Route path="/" element={<p>Dashboard home</p>} />
        </Routes>
      </MemoryRouter>
    </ApolloProvider>,
  )
}

describe('DeviceAdminSection', () => {
  it('is hidden from a USER', async () => {
    setup('USER', detail())
    await screen.findByRole('heading', { name: 'Kettle' })
    expect(screen.queryByRole('region', { name: 'Admin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('lists the actions in order for an admin, with Set key only for Tuya', async () => {
    setup('ADMIN', detail())
    const card = within(await screen.findByRole('region', { name: 'Admin' }))
    expect(card.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Rename',
      'Move room',
      'Change type',
      'Set Tuya local key',
      'Who has access',
      'Remove',
    ])
  })

  it('offers no Change type for a TV or a computer (their kind is fixed)', async () => {
    setup('ADMIN', detail({ name: 'Office PC', brand: 'WOL', kind: 'COMPUTER' }))
    const card = within(await screen.findByRole('region', { name: 'Admin' }))
    expect(card.getByRole('button', { name: 'Rename' })).toBeInTheDocument()
    expect(card.queryByRole('button', { name: 'Change type' })).not.toBeInTheDocument()
  })

  it('omits Set key for non-Tuya devices', async () => {
    setup('ADMIN', detail({ brand: 'KASA' }))
    const card = within(await screen.findByRole('region', { name: 'Admin' }))
    expect(card.queryByRole('button', { name: 'Set Tuya local key' })).not.toBeInTheDocument()
  })

  it('shows Stream source: Local as text for Swann cameras and nothing for Tuya cameras', async () => {
    setup('ADMIN', detail({ brand: 'SWANN', kind: 'CAMERA', streamSource: 'LOCAL' }))
    const card = within(await screen.findByRole('region', { name: 'Admin' }))
    expect(card.getByText('Stream source: Local')).toBeInTheDocument()
    expect(card.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows no stream source for a Tuya camera', async () => {
    setup('ADMIN', detail({ kind: 'CAMERA', streamSource: 'CLOUD' }))
    const card = within(await screen.findByRole('region', { name: 'Admin' }))
    expect(card.queryByText(/Stream source/)).not.toBeInTheDocument()
  })

  it('saves exactly the checked user ids from the access dialog', async () => {
    const calls: unknown[] = []
    setup('ADMIN', detail(), {
      Users: reply({ users: [admin, ana, ben] }),
      DeviceGrants: reply({ deviceGrants: ['u1'] }),
      SetDeviceGrants: (op) => {
        calls.push(op.variables)
        return of({ data: { setDeviceGrants: ['u2'] } })
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Who has access' }))
    await screen.findByRole('checkbox', { name: /Gabriel/ })
    const dialog = within(screen.getByRole('dialog', { name: 'Who has access to Kettle' }))
    expect(dialog.getByRole('checkbox', { name: /Gabriel/ })).toBeDisabled()
    expect(dialog.getByRole('checkbox', { name: 'Ana' })).toBeChecked()
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Ana' }))
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Ben' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls).toEqual([{ deviceId: 'd1', userIds: ['u2'] }]))
  })

  it('confirms removal, then goes to the dashboard', async () => {
    const calls: unknown[] = []
    setup('ADMIN', detail(), {
      RemoveDevice: (op) => {
        calls.push(op.variables)
        return of({ data: { removeDevice: true } })
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Remove Kettle?' }))
    expect(calls).toEqual([])
    fireEvent.click(dialog.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Dashboard home')).toBeInTheDocument()
    expect(calls).toEqual([{ id: 'd1' }])
  })

  it('warns about outlets when removing a power strip', async () => {
    setup('ADMIN', detail(), {
      AdminDevices: reply({
        adminDevices: [adminDeviceFixture({ id: 'd1', adopted: true }), adminDeviceFixture({ id: 'o1', adopted: true, parentId: 'd1' })],
      }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove Kettle?' })
    expect(await within(dialog).findByText(/also removes its 1 outlet/)).toBeInTheDocument()
  })

  it('shows the new name after a rename', async () => {
    let name = 'Kettle'
    setup('ADMIN', detail(), {
      Device: () => of({ data: { device: detail({ name }) } }),
      UpdateDevice: (op) => {
        name = (op.variables as { name: string }).name
        return of({ data: { updateDevice: adminDeviceFixture({ id: 'd1', name, adopted: true }) } })
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Teapot' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('heading', { name: 'Teapot' })).toBeInTheDocument()
  })
})

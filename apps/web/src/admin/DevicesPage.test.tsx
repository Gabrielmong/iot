import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { of } from 'rxjs'
import { adminDeviceFixture, roomFixture } from '../test/adminFixtures'
import { createTestClient, failWith, type Handler, reply } from '../test/testClient'
import { DevicesPage } from './DevicesPage'
import { chooseOption } from '../test/chooseOption'

const living = roomFixture('r1', 'Living room', 0)
type Fixture = ReturnType<typeof adminDeviceFixture>

function setup(initial: Fixture[], kasaConfigured = true, extra: (set: (d: Fixture[]) => void) => Record<string, Handler> = () => ({})) {
  let devices = initial
  const set = (next: Fixture[]) => {
    devices = next
  }
  const client = createTestClient({
    AdminDevices: () => of({ data: { adminDevices: devices } }),
    Rooms: reply({ rooms: [living] }),
    Integrations: reply({
      integrations: { __typename: 'IntegrationStatus', tuyaCloudConfigured: true, kasaConfigured },
    }),
    ...extra(set),
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <DevicesPage />
      </MemoryRouter>
    </ApolloProvider>,
  )
}

const section = async (name: string) => within(await screen.findByRole('region', { name }))

describe('DevicesPage', () => {
  it('adopts a new device and moves it to Your devices after refetch', async () => {
    const plug = adminDeviceFixture({ id: 'p1', name: 'Smart plug' })
    const calls: unknown[] = []
    setup([plug], true, (set) => ({
      AdoptDevice: (op) => {
        calls.push(op.variables)
        const adopted = { ...plug, adopted: true, name: 'Kettle', room: { __typename: 'Room' as const, id: 'r1', name: 'Living room' } }
        set([adopted])
        return reply({ adoptDevice: adopted })(op)
      },
    }))
    const fresh = await section('New on network')
    expect(fresh.getByText(/Smart plug/)).toBeInTheDocument()
    fireEvent.click(fresh.getByRole('button', { name: 'Adopt Smart plug' }))
    const dialog = await screen.findByRole('dialog', { name: 'Adopt device' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Kettle' } })
    await chooseOption('Room', 'Living room', dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Adopt' }))
    const mine = await section('Your devices')
    expect(await mine.findByText(/Kettle/)).toBeInTheDocument()
    expect(calls).toEqual([{ id: 'p1', name: 'Kettle', roomId: 'r1', kind: 'PLUG' }])
    expect(screen.queryByRole('region', { name: 'New on network' })).not.toBeInTheDocument()
    expect(within(await screen.findByRole('table', { name: 'Your devices' })).getAllByRole('row')).toHaveLength(2)
  })

  it('warns that removing a power strip also removes its outlets', async () => {
    const strip = adminDeviceFixture({ id: 's', name: 'Power strip', adopted: true, kind: 'UNKNOWN' })
    const outlet = adminDeviceFixture({ id: 'o', name: 'Coffee', adopted: true, parentId: 's' })
    setup([strip, outlet])
    fireEvent.click(await screen.findByRole('button', { name: 'Options for Power strip' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove Power strip?' })
    expect(within(dialog).getByText(/also removes its 1 outlet/)).toBeInTheDocument()
  })

  it('shows the Tuya local key field empty and masked', async () => {
    setup([adminDeviceFixture({ id: 't', name: 'Lamp', adopted: true, status: 'NEEDS_KEY' })])
    fireEvent.click(await screen.findByRole('button', { name: 'Options for Lamp' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Set Tuya local key' }))
    const key = await screen.findByLabelText('Local key')
    expect(key).toHaveValue('')
    expect(key).toHaveAttribute('type', 'password')
  })

  it('hints that Kasa needs TP-Link credentials when none are configured', async () => {
    setup([adminDeviceFixture({ adopted: true })], false)
    expect(await screen.findByText(/Kasa devices appear only after you save your TP-Link credentials/)).toBeInTheDocument()
  })

  it('shows an error with Retry when the device query fails, then recovers', async () => {
    let fail = true
    setup([adminDeviceFixture({ name: 'Lamp', adopted: true })], true, () => ({
      AdminDevices: (op) => (fail ? failWith('INTERNAL_SERVER_ERROR')(op) : of({ data: { adminDevices: [adminDeviceFixture({ name: 'Lamp', adopted: true })] } })),
    }))
    expect(await screen.findByText("Couldn't load devices.")).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Your devices' })).not.toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/Lamp/)).toBeInTheDocument()
  })

  it('adds a PC: checks the MAC first, then the new row appears', async () => {
    const calls: unknown[] = []
    setup([adminDeviceFixture({ name: 'Lamp', adopted: true })], true, (set) => ({
      AddComputer: (op) => {
        calls.push(op.variables)
        const pc = adminDeviceFixture({ id: 'pc', name: 'Office PC', brand: 'WOL', kind: 'COMPUTER', adopted: true, ip: null, mac: 'aa:bb:cc:dd:ee:ff' })
        set([adminDeviceFixture({ name: 'Lamp', adopted: true }), pc])
        return reply({ addComputer: pc })(op)
      },
    }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add PC' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add PC' }))
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Office PC' } })
    fireEvent.change(dialog.getByLabelText('MAC address'), { target: { value: 'nope' } })
    expect(dialog.getByText('Enter a MAC address like AA:BB:CC:DD:EE:FF')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Add' })).toBeDisabled()
    fireEvent.change(dialog.getByLabelText('MAC address'), { target: { value: 'AA-BB-CC-DD-EE-FF' } })
    expect(dialog.getByRole('button', { name: 'How to set up Wake-on-LAN' })).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Add' }))
    expect(await (await section('Your devices')).findByText(/Office PC/)).toBeInTheDocument()
    expect(calls).toEqual([{ name: 'Office PC', roomId: null, mac: 'AA-BB-CC-DD-EE-FF', ip: null }])
  })

  it('adds a TV by IP', async () => {
    const calls: unknown[] = []
    setup([], true, () => ({
      AddTvByIp: (op) => {
        calls.push(op.variables)
        return reply({ addTvByIp: adminDeviceFixture({ id: 'tv', name: 'Sala', brand: 'ANDROID_TV', kind: 'TV' }) })(op)
      },
    }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add TV' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add TV by IP' }))
    fireEvent.change(dialog.getByLabelText('IP address'), { target: { value: '192.168.0.163' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(calls).toEqual([{ ip: '192.168.0.163' }]))
  })

  it('a TV that needs pairing says so and offers Pair; a computer offers Edit MAC / IP', async () => {
    setup([
      adminDeviceFixture({ id: 'tv', name: 'Sala', brand: 'ANDROID_TV', kind: 'TV', adopted: true, status: 'NEEDS_PAIRING' }),
      adminDeviceFixture({ id: 'pc', name: 'Office PC', brand: 'WOL', kind: 'COMPUTER', adopted: true, mac: 'aa:bb:cc:dd:ee:ff' }),
    ])
    expect((await screen.findAllByText('Needs pairing')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Options for Sala' }))
    expect(await screen.findByRole('menuitem', { name: 'Pair' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Options for Office PC' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit MAC / IP' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit Office PC' }))
    expect(dialog.getByLabelText('MAC address')).toHaveValue('aa:bb:cc:dd:ee:ff')
  })

  it('shows no Kasa hint once credentials are saved', async () => {
    setup([adminDeviceFixture({ adopted: true })], true)
    await screen.findByRole('region', { name: 'Your devices' })
    expect(screen.queryByText(/TP-Link credentials/)).not.toBeInTheDocument()
  })
})

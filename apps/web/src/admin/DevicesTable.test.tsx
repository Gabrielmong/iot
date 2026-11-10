import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { of } from 'rxjs'
import { adminDeviceFixture, roomFixture } from '../test/adminFixtures'
import { createTestClient, reply } from '../test/testClient'
import { DevicesPage } from './DevicesPage'
import { chooseOption } from '../test/chooseOption'

const rancho = roomFixture('r1', 'Rancho', 1)
const sala = roomFixture('r2', 'Sala 2', 2)
const devices = [
  adminDeviceFixture({ id: 'lamp', name: 'Lamp', kind: 'LIGHT', adopted: true, room: sala }),
  adminDeviceFixture({ id: 'pepe', name: 'Cámara Pepe', kind: 'CAMERA', adopted: true, room: rancho, status: 'NEEDS_CREDENTIALS' }),
  adminDeviceFixture({ id: 'kettle', name: 'Kettle', kind: 'PLUG', adopted: true, online: false }),
  adminDeviceFixture({ id: 'fan', name: 'Fan', kind: 'PLUG', adopted: true, room: rancho }),
]

function setup() {
  const client = createTestClient({
    AdminDevices: () => of({ data: { adminDevices: devices } }),
    Rooms: reply({ rooms: [rancho, sala] }),
    Integrations: reply({ integrations: { __typename: 'IntegrationStatus', tuyaCloudConfigured: true, kasaConfigured: true } }),
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <DevicesPage />
      </MemoryRouter>
    </ApolloProvider>,
  )
}

/** Device names in table order (skips the header row). */
async function rowNames() {
  const table = await screen.findByRole('table', { name: 'Your devices' })
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).queryByTestId('device-name')?.textContent ?? r.textContent)
}

describe('Devices table', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists adopted devices sorted by room then name, with no room last', async () => {
    setup()
    expect(await rowNames()).toEqual(['Cámara Pepe', 'Fan', 'Lamp', 'Kettle'])
  })

  it('filters by search, room, type and status, and clears filters', async () => {
    setup()
    await rowNames()
    fireEvent.change(screen.getByLabelText('Search devices'), { target: { value: 'pepe' } })
    expect(await rowNames()).toEqual(['Cámara Pepe'])
    fireEvent.change(screen.getByLabelText('Search devices'), { target: { value: '' } })
    await chooseOption('Room', 'No room')
    expect(await rowNames()).toEqual(['Kettle'])
    await chooseOption('Room', 'Any room')
    await chooseOption('Type', 'Plug')
    expect(await rowNames()).toEqual(['Fan', 'Kettle'])
    await chooseOption('Status', 'Online')
    expect(await rowNames()).toEqual(['Fan'])
    fireEvent.change(screen.getByLabelText('Search devices'), { target: { value: 'nothing like this' } })
    expect(screen.getByText('No devices match')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await rowNames()).toEqual(['Cámara Pepe', 'Fan', 'Lamp', 'Kettle'])
  })

  it('shows problem counts that filter on click', async () => {
    setup()
    await rowNames()
    fireEvent.click(screen.getByRole('button', { name: 'Needs setup · 1' }))
    expect(await rowNames()).toEqual(['Cámara Pepe'])
    fireEvent.click(screen.getByRole('button', { name: 'Offline · 1' }))
    expect(await rowNames()).toEqual(['Kettle'])
  })

  it('sorts by a column and reverses on a second click', async () => {
    setup()
    await rowNames()
    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(await rowNames()).toEqual(['Cámara Pepe', 'Fan', 'Kettle', 'Lamp'])
    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(await rowNames()).toEqual(['Lamp', 'Kettle', 'Fan', 'Cámara Pepe'])
  })

  it('uses compact rows on a phone', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }))
    setup()
    const list = await screen.findByRole('list', { name: 'Your devices' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { deviceFixture } from '../../test/deviceFixtures'
import { createTestClient, liveSubscription, reply } from '../../test/testClient'
import { NavList } from './NavList'

const client = () =>
  createTestClient({
    Devices: reply({ devices: [deviceFixture()] }),
    Rooms: reply({ rooms: [{ __typename: 'Room', id: 'r1', name: 'Living room', sortOrder: 0 }] }),
    DeviceState: liveSubscription().handler,
    DevicesChanged: liveSubscription().handler,
  })

const renderNav = (isGuest: boolean, showRooms = false) =>
  render(
    <ApolloProvider client={client()}>
      <MemoryRouter>
        <NavList isAdmin={false} isGuest={isGuest} collapsed={false} showRooms={showRooms} />
      </MemoryRouter>
    </ApolloProvider>,
  )

const mainLinks = () => screen.getAllByRole('link').map((l) => l.textContent)

beforeEach(() => localStorage.clear())

describe('NavList', () => {
  it("guests don't see the Cameras link", () => {
    renderNav(true)
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Routines' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Cameras' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('users see Cameras', () => {
    renderNav(false)
    expect(screen.getByRole('link', { name: 'Cameras' })).toBeInTheDocument()
  })

  it('on a phone: Home, All devices, Rooms, then the rest', () => {
    renderNav(false)
    expect(mainLinks()).toEqual(['Home', 'All devices', 'Rooms', 'Weather', 'Cameras', 'Routines'])
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'All devices' })).toHaveAttribute('href', '/all')
    expect(screen.getByRole('link', { name: 'Rooms' })).toHaveAttribute('href', '/rooms')
  })

  it('on a computer: no Rooms entry (the rooms sit under All devices)', () => {
    renderNav(false, true)
    expect(mainLinks().slice(0, 2)).toEqual(['Home', 'All devices'])
    expect(screen.queryByRole('link', { name: 'Rooms' })).not.toBeInTheDocument()
  })

  it('on a computer: the rooms under All devices fold away, and stay folded', async () => {
    renderNav(false, true)
    expect(await screen.findByRole('link', { name: 'Living room' })).toBeInTheDocument()
    const hide = screen.getByRole('button', { name: 'Hide rooms' })
    expect(hide).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(hide)
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Living room' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Show rooms' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('remembers folded rooms on this device', () => {
    localStorage.setItem('home.navRoomsOpen', '0')
    renderNav(false, true)
    expect(screen.getByRole('button', { name: 'Show rooms' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Rooms' })).not.toBeInTheDocument()
  })

  it('on a phone: no fold button', () => {
    renderNav(false)
    expect(screen.queryByRole('button', { name: /rooms$/ })).not.toBeInTheDocument()
  })
})

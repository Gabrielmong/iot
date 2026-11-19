import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { deviceFixture } from '../../test/deviceFixtures'
import type { Device } from '../types'
import { RoomWidget } from './RoomWidget'
import { WidgetTile } from './WidgetTile'

const kitchen = { id: 'r2', name: 'Kitchen' }
const plug = (id: string, on: boolean, online = true): Device => {
  const d = deviceFixture({ id, name: id, kind: 'PLUG', on, room: kitchen })
  return { ...d, state: { ...d.state, online } }
}

const renderRoom = (devices: Device[]) =>
  render(
    <MemoryRouter>
      <RoomWidget room={{ id: 'r2', name: 'Kitchen', sortOrder: 0 }} devices={devices} />
    </MemoryRouter>,
  )

describe('RoomWidget', () => {
  it('shows the room name, what is on and what is offline', () => {
    renderRoom([plug('a', true), plug('b', true), plug('c', false), plug('d', false, false), deviceFixture({ id: 'x', on: true, kind: 'PLUG', room: { id: 'r1', name: 'Living room' } })])
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('2 on')).toBeInTheDocument()
    expect(screen.getByText('1 offline')).toBeInTheDocument()
  })

  it('says All off when nothing is on, and nothing about offline when all respond', () => {
    renderRoom([plug('a', false)])
    expect(screen.getByText('All off')).toBeInTheDocument()
    expect(screen.queryByText(/offline/)).not.toBeInTheDocument()
  })
})

describe('Room widget tile', () => {
  it('opens the room when tapped', async () => {
    const data = { routines: [], cameras: [], devices: [plug('a', true)], rooms: [{ id: 'r2', name: 'Kitchen', sortOrder: 0 }] }
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<WidgetTile tile={{ key: 'widget:w', widget: 'ROOM', widgetId: 'w', targetId: 'r2', size: 'S1x1' }} data={data} />} />
          <Route path="/rooms/:roomId" element={<p>room page</p>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Room summary widget' }))
    expect(await screen.findByText('room page')).toBeInTheDocument()
  })
})

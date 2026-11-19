import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { routineFixture } from '../../test/routineFixtures'
import { weatherFixture } from '../../test/weatherFixtures'
import { AddWidgetButton } from './AddWidgetButton'
import type { WidgetData } from './useWidgetData'

const data: WidgetData = {
  weather: weatherFixture(),
  routines: [routineFixture({ id: 'rt1', name: 'Movie night' }), routineFixture({ id: 'rt2', name: 'Bedtime' })],
  cameras: [],
  rooms: [],
  devices: [],
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Add widget' }))

describe('AddWidgetButton', () => {
  it('offers every kind of widget', () => {
    render(<AddWidgetButton data={data} onAdd={vi.fn()} />)
    openMenu()
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Weather',
      'Sun',
      'Rain soon',
      'Moon and daylight',
      'Clock',
      'Routine button',
      'Camera',
      'Room summary',
      'Devices offline',
    ])
  })

  it('adds a widget without a setting straight away', () => {
    const onAdd = vi.fn()
    render(<AddWidgetButton data={data} onAdd={onAdd} />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clock' }))
    expect(onAdd).toHaveBeenCalledWith('CLOCK', undefined)
  })

  it('asks which routine for a routine button, and adds it with that routine', async () => {
    const onAdd = vi.fn()
    render(<AddWidgetButton data={data} onAdd={onAdd} />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Routine button' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Choose a routine' }))
    expect(dialog.getAllByRole('button').map((b) => b.textContent)).toEqual(['Bedtime', 'Movie night', 'Cancel'])
    fireEvent.click(dialog.getByRole('button', { name: 'Movie night' }))
    expect(onAdd).toHaveBeenCalledWith('ROUTINE', 'rt1')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says when there is nothing to point a widget at', async () => {
    render(<AddWidgetButton data={data} onAdd={vi.fn()} />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Camera' }))
    expect(await screen.findByText('No cameras to show.')).toBeInTheDocument()
  })
})

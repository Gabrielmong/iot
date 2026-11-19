import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deviceFixture } from '../../test/deviceFixtures'
import { AddDeviceButton } from './AddDeviceButton'

const porch = deviceFixture({ id: 'd-porch', name: 'Porch light', room: { id: 'r1', name: 'Porch' } })
const kettle = deviceFixture({ id: 'd-kettle', name: 'Kettle', room: { id: 'r2', name: 'Kitchen' } })
const groups = [
  { room: 'Kitchen', devices: [kettle] },
  { room: 'Porch', devices: [porch] },
]

describe('AddDeviceButton', () => {
  it('lists devices by room, adds the picked one and closes', async () => {
    const onAdd = vi.fn()
    render(<AddDeviceButton groups={groups} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add device' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add a device to Home' }))
    expect(dialog.getByText('Kitchen')).toBeInTheDocument()
    expect(dialog.getByText('Porch')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Porch light' }))
    expect(onAdd).toHaveBeenCalledWith('d-porch')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says so when every device is already on Home', () => {
    render(<AddDeviceButton groups={[]} onAdd={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add device' }))
    expect(screen.getByText('Every device is already on Home.')).toBeInTheDocument()
  })
})

import { fireEvent, render, screen, within } from '@testing-library/react'
import { computerFixture, deviceFixture } from '../../test/deviceFixtures'
import type { DraftAction } from '../lib/draft'
import { ActionDialog } from './ActionDialog'

const pc = (agent: boolean) =>
  deviceFixture({
    id: 'pc1',
    name: 'Office PC',
    kind: 'COMPUTER',
    brand: 'WOL',
    computer: computerFixture({ agent: agent ? { connected: true, version: 1001 } : null }),
  })

const wake: DraftAction = { deviceId: 'pc1', on: true, brightness: null, color: null, colorTempK: null, unavailable: false }

function setup(agent: boolean, action: DraftAction = wake) {
  const onSave = vi.fn()
  render(<ActionDialog device={pc(agent)} action={action} onSave={onSave} onClose={vi.fn()} />)
  const power = within(screen.getByRole('group', { name: 'Power' }))
  return { onSave, power }
}

describe('ActionDialog for a PC', () => {
  it('a PC with an agent offers Wake, Sleep and Shut down, but not Restart', () => {
    const { power } = setup(true)
    expect(power.getAllByRole('button').map((b) => b.textContent)).toEqual(['Wake', 'Sleep', 'Shut down'])
  })

  it('saves pcPower: SLEEP (and leaves power alone)', () => {
    const { onSave, power } = setup(true)
    fireEvent.click(power.getByRole('button', { name: 'Sleep' }))
    expect(screen.getAllByText('Sleep')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onSave).toHaveBeenCalledWith({ ...wake, on: null, pcPower: 'SLEEP' })
  })

  it('going back to Wake clears pcPower', () => {
    const { onSave, power } = setup(true, { ...wake, on: null, pcPower: 'SHUTDOWN' })
    expect(power.getByRole('button', { name: 'Shut down' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(power.getByRole('button', { name: 'Wake' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onSave).toHaveBeenCalledWith({ ...wake, on: true, pcPower: null })
  })

  it('a PC without an agent offers only Wake', () => {
    const { power } = setup(false)
    expect(power.getAllByRole('button').map((b) => b.textContent)).toEqual(['Wake'])
  })
})

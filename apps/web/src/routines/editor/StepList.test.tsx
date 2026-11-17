import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { deviceFixture, lightFixture } from '../../test/deviceFixtures'
import { emptyDraft, type Draft } from '../lib/draft'
import { StepList } from './StepList'

const callable = vi.hoisted(() => ({ routines: [{ id: 'lock', name: 'Lock up' }, { id: 'goodnight', name: 'Goodnight' }] as { id: string; name: string }[] }))
vi.mock('../data/useCallableRoutines', () => ({ useCallableRoutines: () => ({ routines: callable.routines, loading: false }) }))

const living = { id: 'r1', name: 'Living room' }
const lamp = lightFixture({}, { id: 'lamp', name: 'Floor lamp', room: living })
const tv = deviceFixture({ id: 'tv', name: 'TV plug', kind: 'PLUG', room: living })
const cam = deviceFixture({ id: 'cam', name: 'Door camera', kind: 'CAMERA', room: living })

function Harness({ onDraft, initial = emptyDraft('PERSONAL') }: { onDraft: (d: Draft) => void; initial?: Draft }) {
  const [draft, setDraft] = useState(initial)
  return (
    <StepList
      draft={draft}
      devices={[lamp, tv, cam]}
      onChange={(d) => {
        setDraft(d)
        onDraft(d)
      }}
    />
  )
}

function setup(initial?: Draft) {
  let latest: Draft | null = null
  render(<Harness initial={initial} onDraft={(d) => (latest = d)} />)
  return { draft: () => latest! }
}

const step = (n: number) => screen.getByRole('group', { name: new RegExp(`^Step ${n}`) })

async function addDevice(stepNumber: number, deviceName: string) {
  fireEvent.click(within(step(stepNumber)).getByRole('button', { name: 'Add device' }))
  const picker = await screen.findByRole('dialog', { name: 'Pick a device' })
  fireEvent.click(within(picker).getByRole('button', { name: deviceName }))
  return screen.findByRole('dialog', { name: deviceName })
}

describe('StepList', () => {
  beforeEach(() => {
    callable.routines = [{ id: 'lock', name: 'Lock up' }, { id: 'goodnight', name: 'Goodnight' }]
  })

  it('adds a Run routine step from the picker', async () => {
    const { draft } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add routine' }))
    const picker = await screen.findByRole('dialog', { name: 'Pick a routine' })
    expect(within(picker).getByRole('button', { name: 'Goodnight' })).toBeInTheDocument()
    fireEvent.click(within(picker).getByRole('button', { name: 'Lock up' }))
    expect(screen.getByRole('group', { name: /^Step 2: Run routine/ })).toHaveTextContent('Lock up')
    expect(draft().steps[1]).toMatchObject({ kind: 'ROUTINE', routineId: 'lock', routineName: 'Lock up' })
  })

  it('changes the routine of a step', async () => {
    const initial = emptyDraft('PERSONAL')
    initial.steps = [{ key: 'r', kind: 'ROUTINE', routineId: 'lock', routineName: 'Lock up' }]
    const { draft } = setup(initial)
    fireEvent.click(within(step(1)).getByRole('button', { name: 'Change' }))
    const picker = await screen.findByRole('dialog', { name: 'Pick a routine' })
    fireEvent.click(within(picker).getByRole('button', { name: 'Goodnight' }))
    expect(within(step(1)).getByText('Goodnight')).toBeInTheDocument()
    expect(draft().steps).toHaveLength(1)
    expect(draft().steps[0]).toMatchObject({ routineId: 'goodnight', routineName: 'Goodnight' })
  })

  it('shows a removed routine', () => {
    const initial = emptyDraft('PERSONAL')
    initial.steps = [{ key: 'r', kind: 'ROUTINE', routineId: 'gone', routineName: null }]
    setup(initial)
    expect(within(step(1)).getByText('Removed routine')).toBeInTheDocument()
  })

  it('says so when there is no other routine to run', async () => {
    callable.routines = []
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add routine' }))
    const picker = await screen.findByRole('dialog', { name: 'Pick a routine' })
    expect(within(picker).getByText('No other routines to run')).toBeInTheDocument()
  })

  it('adds Set and Wait steps', () => {
    const { draft } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add wait' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add device step' }))
    expect(draft().steps.map((s) => s.kind)).toEqual(['SET', 'WAIT', 'SET'])
    fireEvent.change(within(step(2)).getByLabelText('Minutes'), { target: { value: '45' } })
    expect(draft().steps[1]).toMatchObject({ kind: 'WAIT', minutes: 45 })
  })

  it('picks a device and switches it off', async () => {
    const { draft } = setup()
    const dialog = await addDevice(1, 'TV plug')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Off' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(within(step(1)).getByText('TV plug')).toBeInTheDocument()
    expect(within(step(1)).getByText('Off')).toBeInTheDocument()
    expect(draft().steps[0]).toMatchObject({ actions: [{ deviceId: 'tv', on: false }] })
  })

  it('offers only switchable devices, and no cameras', async () => {
    setup()
    fireEvent.click(within(step(1)).getByRole('button', { name: 'Add device' }))
    const picker = await screen.findByRole('dialog', { name: 'Pick a device' })
    expect(within(picker).getByRole('button', { name: 'Floor lamp' })).toBeInTheDocument()
    expect(within(picker).queryByRole('button', { name: 'Door camera' })).not.toBeInTheDocument()
  })

  it("gives a plug no 'Leave as is' and no light controls", async () => {
    setup()
    const dialog = await addDevice(1, 'TV plug')
    expect(within(dialog).queryByRole('button', { name: 'Leave as is' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('slider', { name: 'Brightness' })).not.toBeInTheDocument()
  })

  it('a color replaces the white temperature and vice versa', async () => {
    const { draft } = setup()
    const dialog = await addDevice(1, 'Floor lamp')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Color Red' }))
    expect(within(dialog).getByText('On · Red')).toBeInTheDocument()
    fireEvent.keyDown(within(dialog).getByRole('slider', { name: 'White temperature' }), { key: 'ArrowRight' })
    expect(within(dialog).getByText(/^On · \w+ white$/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(draft().steps[0]).toMatchObject({ actions: [{ deviceId: 'lamp', color: null, colorTempK: expect.any(Number) }] })
  })

  it('leaving power as is keeps other settings', async () => {
    const { draft } = setup()
    const dialog = await addDevice(1, 'Floor lamp')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave as is' }))
    fireEvent.keyDown(within(dialog).getByRole('slider', { name: 'Brightness' }), { key: 'ArrowLeft' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(draft().steps[0]).toMatchObject({ actions: [{ deviceId: 'lamp', on: null, brightness: expect.any(Number) }] })
  })

  it('shows a device that is no longer available so it can be removed', () => {
    const initial = emptyDraft('PERSONAL')
    initial.steps = [{ key: 's', kind: 'SET', actions: [{ deviceId: 'gone', on: true, brightness: null, color: null, colorTempK: null, unavailable: true }] }]
    const { draft } = setup(initial)
    expect(within(step(1)).getByText('Unavailable device')).toBeInTheDocument()
    fireEvent.click(within(step(1)).getByRole('button', { name: 'Remove Unavailable device' }))
    expect(draft().steps[0]).toMatchObject({ actions: [] })
  })

  it('moves a step down and removes one', () => {
    const { draft } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add wait' }))
    fireEvent.click(within(step(1)).getByRole('button', { name: 'Move step 1 down' }))
    expect(draft().steps.map((s) => s.kind)).toEqual(['WAIT', 'SET'])
    fireEvent.click(within(step(1)).getByRole('button', { name: 'Remove step 1' }))
    expect(draft().steps.map((s) => s.kind)).toEqual(['SET'])
  })
})

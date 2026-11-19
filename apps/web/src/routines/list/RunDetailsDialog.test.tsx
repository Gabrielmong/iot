import { fireEvent, render, screen, within } from '@testing-library/react'
import { routineFixture, runFixture, NO_CONDITION_FIELDS } from '../../test/routineFixtures'
import { clockTime } from '../lib/runProgress'
import type { Routine } from '../types'
import { RunDetailsDialog } from './RunDetailsDialog'

const names = new Map([
  ['lamp', 'Floor lamp'],
  ['tv', 'TV plug'],
])

function movieNight(lastRun: Routine['lastRun']): Routine {
  const r = routineFixture({ name: 'Movie night', deviceIds: ['lamp', 'tv'], lastRun })
  r.steps.push({ ...NO_CONDITION_FIELDS, kind: 'WAIT', waitMinutes: 45, routineId: null, routineName: null, actions: [] })
  r.steps.push({ ...NO_CONDITION_FIELDS, kind: 'SET', waitMinutes: null, routineId: null, routineName: null, actions: [{ ...r.steps[0]!.actions[0]!, on: false }] })
  return r
}

const step = (n: number) => screen.getByRole('listitem', { name: new RegExp(`^Step ${n}`) })

describe('RunDetailsDialog', () => {
  it('shows finished, current and next steps of a running routine', () => {
    const waitUntil = new Date(Date.now() + 12.5 * 60_000).toISOString()
    const run = runFixture('RUNNING', [{ step: 0, deviceId: 'tv', deviceName: 'TV plug', reason: 'UNREACHABLE' }], 1, { currentStep: 1, waitUntil, startedBy: 'Ann' })
    const onStop = vi.fn()
    render(<RunDetailsDialog routine={movieNight(run)} deviceNames={names} onStop={onStop} onClose={() => {}} />)

    expect(screen.getByRole('dialog', { name: 'Movie night' })).toBeInTheDocument()
    expect(screen.getByText(/by Ann$/)).toBeInTheDocument()
    expect(within(step(1)).getByText('Done')).toBeInTheDocument()
    expect(within(step(1)).getByText('Floor lamp: On ✓')).toBeInTheDocument()
    expect(within(step(1)).getByText("TV plug: On ⚠ couldn't reach it")).toBeInTheDocument()
    expect(within(step(2)).getByText('Now')).toBeInTheDocument()
    expect(within(step(2)).getByText(`12 min left · next step at ${clockTime(waitUntil)}`)).toBeInTheDocument()
    expect(within(step(3)).getByText('Next')).toBeInTheDocument()
    expect(within(step(3)).getByText('Floor lamp: Off')).toBeInTheDocument()
    expect(screen.getByText('1 other device had problems')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onStop).toHaveBeenCalled()
  })

  it('shows the steps and how the last run went when not running', () => {
    const run = runFixture('PARTIAL', [{ step: 0, deviceId: 'tv', deviceName: 'TV plug', reason: 'NOT_READY' }], 0, { startedBy: null })
    render(<RunDetailsDialog routine={movieNight(run)} deviceNames={names} onStop={() => {}} onClose={() => {}} />)
    expect(screen.getByText(/by the schedule · Some devices had problems$/)).toBeInTheDocument()
    expect(within(step(1)).getByText('TV plug: On ⚠ needs setup')).toBeInTheDocument()
    expect(within(step(2)).getByText(/Wait 45 min$/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
  })

  it("names devices the viewer can't see generically", () => {
    render(<RunDetailsDialog routine={movieNight(null)} deviceNames={new Map()} onStop={() => {}} onClose={() => {}} />)
    expect(within(step(1)).getAllByText(/^Another device: On$/)).toHaveLength(2)
    expect(screen.getByText('Not run yet')).toBeInTheDocument()
  })

  it("keeps the screen-reader step label 1px so it can't stretch the window", () => {
    render(<RunDetailsDialog routine={movieNight(null)} deviceNames={names} onStop={() => {}} onClose={() => {}} />)
    const hidden = within(step(1)).getByText(/^Step 1:/)
    expect(getComputedStyle(hidden).width).toBe('1px')
    expect(getComputedStyle(hidden).height).toBe('1px')
  })

  it('lists the problems of a called routine under its step', () => {
    const r = routineFixture({ name: 'Bedtime', deviceIds: [], lastRun: null })
    r.steps.push({ ...NO_CONDITION_FIELDS, kind: 'ROUTINE', waitMinutes: null, routineId: 'lock', routineName: 'Lock up', actions: [] })
    r.lastRun = runFixture('PARTIAL', [{ step: 1, deviceId: 'lamp', deviceName: 'Lamp', reason: 'UNREACHABLE', routineName: 'Lock up' }], 0)
    render(<RunDetailsDialog routine={r} deviceNames={names} onStop={() => {}} onClose={() => {}} />)
    expect(within(step(2)).getByText(/Run Lock up$/)).toBeInTheDocument()
    expect(within(step(2)).getByText("⚠ Lock up › Lamp: couldn't reach it")).toBeInTheDocument()
  })

  it('words a problem with the call itself, and one inside a called routine, differently', () => {
    const r = routineFixture({ name: 'Bedtime', deviceIds: [], lastRun: null })
    r.steps.push({ ...NO_CONDITION_FIELDS, kind: 'ROUTINE', waitMinutes: null, routineId: 'lock', routineName: 'Lock up', actions: [] })
    r.lastRun = runFixture(
      'PARTIAL',
      [
        { step: 1, deviceName: null, reason: 'ROUTINE_REMOVED', routineName: null },
        { step: 1, deviceName: null, reason: 'ROUTINE_REMOVED', routineName: 'Lock up' },
      ],
      0,
    )
    render(<RunDetailsDialog routine={r} deviceNames={names} onStop={() => {}} onClose={() => {}} />)
    expect(within(step(2)).getByText('⚠ Routine: routine removed')).toBeInTheDocument()
    expect(within(step(2)).getByText('⚠ Lock up › Run routine: routine removed')).toBeInTheDocument()
  })

  it('shows weather check outcomes and an unavailable weather problem', () => {
    const r = routineFixture({ name: 'Porch' })
    r.steps.push({ ...NO_CONDITION_FIELDS, kind: 'CONTINUE_IF', waitMinutes: null, routineId: null, routineName: null, actions: [], conditions: [{ metric: 'RAINING_NOW', op: 'IS_NOT', value: null }] })
    const run = runFixture('PARTIAL', [{ step: 1, deviceName: null, reason: 'WEATHER_UNAVAILABLE' }], 0, { notes: [{ kind: 'STOPPED', step: 1, conditions: 'not raining now' }] })
    r.lastRun = run
    render(<RunDetailsDialog routine={r} deviceNames={names} onStop={() => {}} onClose={() => {}} />)
    expect(within(step(2)).getByText(/Only continue if not raining now/)).toBeInTheDocument()
    expect(screen.getByText(/Weather unavailable/)).toBeInTheDocument()
    expect(screen.getByText("Stopped: not raining now wasn't met")).toBeInTheDocument()
  })
})

import { emptyDraft, type Draft, type DraftAction, type DraftStep } from './draft'
import { draftErrors } from './draftErrors'

const lampOn: DraftAction = { deviceId: 'lamp', on: true, brightness: null, color: null, colorTempK: null, unavailable: false }
const set = (actions = [lampOn]): DraftStep => ({ key: Math.random().toString(), kind: 'SET', actions })
const wait = (minutes: number): DraftStep => ({ key: Math.random().toString(), kind: 'WAIT', minutes })
const routine = (routineId: string, routineName: string | null): DraftStep => ({ key: Math.random().toString(), kind: 'ROUTINE', routineId, routineName })
const temp = (value: number | null) => ({ key: 'c', metric: 'TEMP_C' as const, op: 'ABOVE' as const, value })
const continueIf = (conditions = [temp(28)]): DraftStep => ({ key: Math.random().toString(), kind: 'CONTINUE_IF', conditions })
const ifStep = (then: { id: string | null; name: string | null }, conditions = [temp(28)]): DraftStep => ({
  key: Math.random().toString(),
  kind: 'IF',
  conditions,
  thenRoutineId: then.id,
  thenRoutineName: then.name,
  elseRoutineId: null,
  elseRoutineName: null,
})
const valid = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft('PERSONAL'), name: 'Movie night', steps: [set()], ...over })

describe('draftErrors', () => {
  it('accepts a valid draft', () => {
    expect(draftErrors(valid())).toEqual([])
  })

  it('needs a name of up to 40 characters', () => {
    expect(draftErrors(valid({ name: '  ' }))).toEqual(['Give the routine a name'])
    expect(draftErrors(valid({ name: 'x'.repeat(41) }))).toEqual(['Routine name must be 1-40 characters'])
  })

  it('needs a device or a routine', () => {
    expect(draftErrors(valid({ steps: [set([]), wait(5)] }))).toEqual(['Add a device or a routine'])
    expect(draftErrors(valid({ steps: [routine('b', 'Bedtime')] }))).toEqual([])
  })

  it('asks to remove a routine that no longer exists', () => {
    expect(draftErrors(valid({ steps: [set(), routine('b', null)] }))).toEqual(['Remove the missing routine'])
  })

  it('limits waits to 1-720 minutes and steps to 20', () => {
    expect(draftErrors(valid({ steps: [set(), wait(0)] }))).toEqual(['Waits must be 1 to 720 minutes'])
    expect(draftErrors(valid({ steps: [set(), wait(721)] }))).toEqual(['Waits must be 1 to 720 minutes'])
    expect(draftErrors(valid({ steps: [set(), ...Array.from({ length: 20 }, () => wait(1))] }))).toEqual(['A routine can have at most 20 steps'])
  })

  it('flags color with white temperature, and a device that changes nothing', () => {
    const both = { ...lampOn, color: { r: 1, g: 2, b: 3 }, colorTempK: 3000 }
    expect(draftErrors(valid({ steps: [set([both])] }))).toEqual(['Pick a color or a white temperature, not both'])
    expect(draftErrors(valid({ steps: [set([{ ...lampOn, on: null }])] }))).toEqual(['Each device must change something'])
  })

  it('asks to remove devices that are no longer available', () => {
    expect(draftErrors(valid({ steps: [set([lampOn, { ...lampOn, deviceId: 'x', unavailable: true }])] }))).toEqual([
      'Remove devices that are no longer available',
    ])
  })

  it('needs days on every schedule and at most 10 rows', () => {
    const row = { key: 'k', anchor: 'CLOCK' as const, time: '07:00', offsetMinutes: 0, days: [1], enabled: true }
    expect(draftErrors(valid({ schedules: [{ ...row, days: [] }] }))).toEqual(['Pick at least one day for each time'])
    expect(draftErrors(valid({ schedules: Array(11).fill(row) }))).toEqual(['A routine can have at most 10 schedules'])
  })

  it('needs a routine for an If to run', () => {
    expect(draftErrors(valid({ steps: [set(), ifStep({ id: null, name: null })] }))).toEqual(['Pick a routine to run'])
    expect(draftErrors(valid({ steps: [ifStep({ id: 'cool', name: 'Cool down' })] }))).toEqual([])
  })

  it('asks to replace a removed routine in an If', () => {
    expect(draftErrors(valid({ steps: [set(), ifStep({ id: 'gone', name: null })] }))).toEqual(['Replace the removed routine'])
  })

  it('checks conditions like the server', () => {
    expect(draftErrors(valid({ steps: [set(), continueIf([])] }))).toEqual(['Add 1 to 5 conditions'])
    expect(draftErrors(valid({ steps: [set(), continueIf(Array(6).fill(temp(1)))] }))).toEqual(['Add 1 to 5 conditions'])
    expect(draftErrors(valid({ steps: [set(), continueIf([temp(null)])] }))).toEqual(['Enter a value'])
    expect(draftErrors(valid({ steps: [set(), continueIf([temp(61)])] }))).toEqual(['Temperature must be from -50 to 60'])
  })

  it('does not count an Only-continue-if step as something to do', () => {
    expect(draftErrors(valid({ steps: [continueIf()] }))).toEqual(['Add a device or a routine'])
  })
})

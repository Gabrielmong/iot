import { computerFixture, deviceFixture, lightFixture } from '../../test/deviceFixtures'
import { routineFixture, NO_CONDITION_FIELDS } from '../../test/routineFixtures'
import { draftToInput, emptyDraft, routineToDraft } from './draft'

const lamp = lightFixture({}, { id: 'lamp' })
const pc = (agent: boolean) =>
  deviceFixture({ id: 'pc', kind: 'COMPUTER', brand: 'WOL', computer: computerFixture({ agent: agent ? { connected: false, version: 1001 } : null }) })

describe('draft', () => {
  it('starts with one empty Set step and no schedules', () => {
    const d = emptyDraft('PERSONAL')
    expect(d).toMatchObject({ name: '', scope: 'PERSONAL', roomId: null, schedules: [], audience: [] })
    expect(d.steps).toEqual([{ key: expect.any(String), kind: 'SET', actions: [] }])
  })

  it('drops devices that were removed and counts them', () => {
    const r = routineFixture({ deviceIds: ['lamp', 'gone'], removedIds: ['gone'] })
    const { draft, droppedDevices } = routineToDraft(r, [lamp])
    expect(droppedDevices).toBe(1)
    expect(draft.steps[0]).toMatchObject({ kind: 'SET', actions: [{ deviceId: 'lamp', unavailable: false }] })
  })

  it('keeps a device that still exists but this routine can no longer use, flagged unavailable', () => {
    const r = routineFixture({ deviceIds: ['lamp', 'revoked'] })
    const { draft, droppedDevices } = routineToDraft(r, [lamp])
    expect(droppedDevices).toBe(0)
    expect(draft.steps[0]).toMatchObject({ actions: [{ deviceId: 'lamp', unavailable: false }, { deviceId: 'revoked', unavailable: true }] })
  })

  it('clears light settings a device no longer supports', () => {
    const r = routineFixture({ deviceIds: ['lamp'] })
    r.steps[0]!.actions[0] = { ...r.steps[0]!.actions[0]!, brightness: 20, colorTempK: 2700 }
    const plug = deviceFixture({ id: 'lamp', kind: 'PLUG' })
    expect(routineToDraft(r, [plug]).draft.steps[0]).toMatchObject({ actions: [{ deviceId: 'lamp', on: true, brightness: null, colorTempK: null }] })
  })

  it('keeps Sleep for a PC with an agent and sends it alone', () => {
    const r = routineFixture({ deviceIds: ['pc'] })
    r.steps[0]!.actions[0] = { ...r.steps[0]!.actions[0]!, on: null, pcPower: 'SLEEP' }
    const { draft } = routineToDraft(r, [pc(true)])
    expect(draft.steps[0]).toMatchObject({ actions: [{ deviceId: 'pc', on: null, pcPower: 'SLEEP', unavailable: false }] })
    expect(draftToInput(draft).steps[0]).toEqual({
      kind: 'SET',
      actions: [{ deviceId: 'pc', on: null, brightness: null, color: null, colorTempK: null, pcPower: 'SLEEP' }],
    })
  })

  it('flags Shut down unavailable once the PC has no agent, rather than turning it into Wake', () => {
    const r = routineFixture({ deviceIds: ['pc'] })
    r.steps[0]!.actions[0] = { ...r.steps[0]!.actions[0]!, on: null, pcPower: 'SHUTDOWN' }
    expect(routineToDraft(r, [pc(false)]).draft.steps[0]).toMatchObject({
      actions: [{ deviceId: 'pc', on: null, pcPower: 'SHUTDOWN', unavailable: true }],
    })
  })

  it('round-trips a routine through the draft', () => {
    const r = routineFixture({
      name: 'Movie night',
      scope: 'SHARED',
      audience: ['ann'],
      room: { id: 'r1', name: 'Living room' },
      deviceIds: ['lamp'],
      schedules: [{ time: '07:00', days: [1, 2], enabled: false }],
    })
    r.steps.push({ ...NO_CONDITION_FIELDS, kind: 'WAIT', waitMinutes: 45, routineId: null, routineName: null, actions: [] })
    const { draft } = routineToDraft(r, [lamp])
    expect(draftToInput(draft)).toEqual({
      name: 'Movie night',
      scope: 'SHARED',
      roomId: 'r1',
      audience: ['ann'],
      steps: [
        { kind: 'SET', actions: [{ deviceId: 'lamp', on: true, brightness: null, color: null, colorTempK: null, pcPower: null }] },
        { kind: 'WAIT', waitMinutes: 45 },
      ],
      schedules: [{ anchor: 'CLOCK', time: '07:00', offsetMinutes: 0, days: [1, 2], enabled: false }],
    })
  })

  it('round-trips weather check steps', () => {
    const r = routineFixture({ deviceIds: ['lamp'] })
    const cond = (metric: 'TEMP_C' | 'RAINING_NOW', op: 'ABOVE' | 'IS_NOT', value: number | null) => ({ __typename: 'Condition' as const, metric, op, value })
    r.steps.push({ ...NO_CONDITION_FIELDS, kind: 'CONTINUE_IF', waitMinutes: null, routineId: null, routineName: null, actions: [], conditions: [cond('RAINING_NOW', 'IS_NOT', null)] })
    r.steps.push({
      ...NO_CONDITION_FIELDS,
      kind: 'IF',
      waitMinutes: null,
      routineId: null,
      routineName: null,
      actions: [],
      conditions: [cond('TEMP_C', 'ABOVE', 28)],
      thenRoutineId: 'cool',
      thenRoutineName: 'Cool down',
    })
    const { draft } = routineToDraft(r, [lamp])
    expect(draft.steps[2]).toMatchObject({ kind: 'IF', thenRoutineId: 'cool', thenRoutineName: 'Cool down', elseRoutineId: null, elseRoutineName: null })
    expect(draftToInput(draft).steps.slice(1)).toEqual([
      { kind: 'CONTINUE_IF', conditions: [{ metric: 'RAINING_NOW', op: 'IS_NOT', value: null }] },
      { kind: 'IF', conditions: [{ metric: 'TEMP_C', op: 'ABOVE', value: 28 }], thenRoutineId: 'cool', elseRoutineId: null },
    ])
  })

  it('round-trips a sun schedule, sending no time', () => {
    const r = routineFixture({ deviceIds: ['lamp'], schedules: [{ time: null, anchor: 'SUNSET', offsetMinutes: -30, days: [5], enabled: true }] })
    const { draft } = routineToDraft(r, [lamp])
    expect(draft.schedules[0]).toMatchObject({ anchor: 'SUNSET', offsetMinutes: -30, time: '07:00' })
    expect(draftToInput(draft).schedules).toEqual([{ anchor: 'SUNSET', time: null, offsetMinutes: -30, days: [5], enabled: true }])
  })

  it('sends a clock schedule with no offset', () => {
    const { draft } = routineToDraft(routineFixture({ deviceIds: ['lamp'], schedules: [{ time: '07:00', days: [1], enabled: true }] }), [lamp])
    draft.schedules[0] = { ...draft.schedules[0]!, offsetMinutes: 20 }
    expect(draftToInput(draft).schedules).toEqual([{ anchor: 'CLOCK', time: '07:00', offsetMinutes: 0, days: [1], enabled: true }])
  })

  it('keeps a Run routine step with its name, or a null name when the routine was removed', () => {
    const r = routineFixture()
    r.steps.push({ ...NO_CONDITION_FIELDS, kind: 'ROUTINE', waitMinutes: null, actions: [], routineId: 'b', routineName: 'Bedtime' })
    r.steps.push({ ...NO_CONDITION_FIELDS, kind: 'ROUTINE', waitMinutes: null, actions: [], routineId: 'c', routineName: null })
    const { draft } = routineToDraft(r, [lamp])
    expect(draft.steps.slice(1)).toMatchObject([
      { kind: 'ROUTINE', routineId: 'b', routineName: 'Bedtime' },
      { kind: 'ROUTINE', routineId: 'c', routineName: null },
    ])
    expect(draftToInput(draft).steps.slice(1)).toEqual([
      { kind: 'ROUTINE', routineId: 'b' },
      { kind: 'ROUTINE', routineId: 'c' },
    ])
  })

  it('sends no audience for personal routines and trims the name', () => {
    const d = { ...emptyDraft('PERSONAL'), name: '  Bedtime ', audience: ['x'] }
    expect(draftToInput(d)).toMatchObject({ name: 'Bedtime', audience: null })
  })
})

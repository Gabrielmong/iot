import { deviceFixture, lightFixture } from '../../test/deviceFixtures'
import { routineFixture } from '../../test/routineFixtures'
import { draftToInput, emptyDraft, routineToDraft } from './draft'

const lamp = lightFixture({}, { id: 'lamp' })

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

  it('round-trips a routine through the draft', () => {
    const r = routineFixture({
      name: 'Movie night',
      scope: 'SHARED',
      audience: ['ann'],
      room: { id: 'r1', name: 'Living room' },
      deviceIds: ['lamp'],
      schedules: [{ time: '07:00', days: [1, 2], enabled: false }],
    })
    r.steps.push({ kind: 'WAIT', waitMinutes: 45, routineId: null, routineName: null, actions: [] })
    const { draft } = routineToDraft(r, [lamp])
    expect(draftToInput(draft)).toEqual({
      name: 'Movie night',
      scope: 'SHARED',
      roomId: 'r1',
      audience: ['ann'],
      steps: [
        { kind: 'SET', actions: [{ deviceId: 'lamp', on: true, brightness: null, color: null, colorTempK: null }] },
        { kind: 'WAIT', waitMinutes: 45 },
      ],
      schedules: [{ time: '07:00', days: [1, 2], enabled: false }],
    })
  })

  it('keeps a Run routine step with its name, or a null name when the routine was removed', () => {
    const r = routineFixture()
    r.steps.push({ kind: 'ROUTINE', waitMinutes: null, actions: [], routineId: 'b', routineName: 'Bedtime' })
    r.steps.push({ kind: 'ROUTINE', waitMinutes: null, actions: [], routineId: 'c', routineName: null })
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

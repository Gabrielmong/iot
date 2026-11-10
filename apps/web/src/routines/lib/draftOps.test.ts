import { emptyDraft, type Draft, type DraftAction } from './draft'
import { addSchedule, addStep, moveStep, removeAction, removeSchedule, removeStep, setWait, updateSchedule, upsertAction } from './draftOps'

const action = (deviceId: string, over: Partial<DraftAction> = {}): DraftAction => ({ deviceId, on: true, brightness: null, color: null, colorTempK: null, unavailable: false, ...over })
const kinds = (d: Draft) => d.steps.map((s) => s.kind)

describe('draftOps', () => {
  it('adds, removes and reorders steps', () => {
    let d = addStep(addStep(emptyDraft('PERSONAL'), 'WAIT'), 'SET')
    expect(kinds(d)).toEqual(['SET', 'WAIT', 'SET'])
    d = moveStep(d, 0, 2)
    expect(kinds(d)).toEqual(['WAIT', 'SET', 'SET'])
    d = removeStep(d, d.steps[0]!.key)
    expect(kinds(d)).toEqual(['SET', 'SET'])
  })

  it('new waits default to 5 minutes and can be changed', () => {
    const d = addStep(emptyDraft('PERSONAL'), 'WAIT')
    const wait = d.steps[1]!
    expect(wait).toMatchObject({ kind: 'WAIT', minutes: 5 })
    expect(setWait(d, wait.key, 45).steps[1]).toMatchObject({ minutes: 45 })
  })

  it('adds a device to a step, replaces its settings, and removes it', () => {
    let d = emptyDraft('PERSONAL')
    const key = d.steps[0]!.key
    d = upsertAction(d, key, action('lamp'))
    d = upsertAction(d, key, action('tv'))
    d = upsertAction(d, key, action('lamp', { on: false }))
    expect(d.steps[0]).toMatchObject({ actions: [action('lamp', { on: false }), action('tv')] })
    d = removeAction(d, key, 'lamp')
    expect(d.steps[0]).toMatchObject({ actions: [action('tv')] })
  })

  it('adds, edits and removes schedule rows', () => {
    let d = addSchedule(emptyDraft('PERSONAL'))
    expect(d.schedules).toEqual([{ key: expect.any(String), time: '07:00', days: [1, 2, 3, 4, 5], enabled: true }])
    const key = d.schedules[0]!.key
    d = updateSchedule(d, key, { time: '22:30', enabled: false })
    expect(d.schedules[0]).toMatchObject({ time: '22:30', enabled: false })
    expect(removeSchedule(d, key).schedules).toEqual([])
  })
})

import { groupErrors, groupInput, type GroupDraft } from './groupInput'

const draft = (over: Partial<GroupDraft> = {}): GroupDraft => ({ name: 'Front', scope: 'PERSONAL', layout: 4, cameraIds: ['a'], audience: [], ...over })

describe('groupInput', () => {
  it('trims the name and sends an audience only for shared groups', () => {
    expect(groupInput(draft({ name: '  Front ', audience: ['x'] }))).toEqual({ name: 'Front', scope: 'PERSONAL', layout: 4, cameraIds: ['a'], audience: null })
    expect(groupInput(draft({ scope: 'SHARED', audience: ['x'] })).audience).toEqual(['x'])
  })

  it('explains what stops a group from saving', () => {
    expect(groupErrors(draft())).toEqual([])
    expect(groupErrors(draft({ name: ' ' }))).toEqual(['Give the group a name'])
    expect(groupErrors(draft({ cameraIds: [] }))).toEqual(['A group needs 1 to 16 cameras'])
    expect(groupErrors(draft({ cameraIds: Array.from({ length: 17 }, (_, i) => `c${i}`) }))).toEqual(['A group needs 1 to 16 cameras'])
  })
})

import { differsFromGroup, initialSelection, selectGroup, toggleCamera, visibleSelection } from './selection'

const group = (id: string, cameraIds: string[], layout = 4) => ({ id, cameraIds, layout })

describe('selection', () => {
  it('adds cameras in the order ticked and removes them, keeping the group highlighted', () => {
    let s = selectGroup(group('g', ['a']))
    s = toggleCamera(s, 'b')
    expect(s).toEqual({ cameraIds: ['a', 'b'], layout: 4, groupId: 'g' })
    expect(toggleCamera(s, 'a').cameraIds).toEqual(['b'])
  })

  it('picking a group takes its cameras and layout', () => {
    expect(selectGroup(group('g', ['c', 'a'], 16))).toEqual({ cameraIds: ['c', 'a'], layout: 16, groupId: 'g' })
  })

  it('knows when the view no longer matches its group', () => {
    const g = group('g', ['a', 'b'])
    const s = selectGroup(g)
    expect(differsFromGroup(s, g)).toBe(false)
    expect(differsFromGroup({ ...s, cameraIds: ['b', 'a'] }, g)).toBe(true)
    expect(differsFromGroup({ ...s, layout: 6 }, g)).toBe(true)
    expect(differsFromGroup(toggleCamera(s, 'c'), g)).toBe(true)
    expect(differsFromGroup(s, null)).toBe(false)
  })

  it('keeps only cameras the viewer can see, in order', () => {
    expect(visibleSelection({ cameraIds: ['a', 'x', 'b'], layout: 4, groupId: null }, new Set(['b', 'a']))).toEqual(['a', 'b'])
  })

  it('opens on the first personal group, else the first shared one, else nothing', () => {
    expect(initialSelection({ mine: [group('m', ['a'])], shared: [group('s', ['b'])] }).groupId).toBe('m')
    expect(initialSelection({ mine: [], shared: [group('s', ['b'], 8)] })).toEqual({ cameraIds: ['b'], layout: 8, groupId: 's' })
    expect(initialSelection({ mine: [], shared: [] })).toEqual({ cameraIds: [], layout: 4, groupId: null })
  })
})

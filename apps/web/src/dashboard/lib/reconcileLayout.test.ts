import { deviceFixture } from '../../test/deviceFixtures'
import { reconcileLayout } from './reconcileLayout'

const a = deviceFixture({ id: 'a' })
const b = deviceFixture({ id: 'b' })
const c = deviceFixture({ id: 'c' })
const view = (tiles: ReturnType<typeof reconcileLayout>) => tiles.map((t) => `${t.device.id}:${t.size}`)

describe('reconcileLayout', () => {
  it('uses server order at 1×1 when there is no layout', () => {
    expect(view(reconcileLayout(undefined, [a, b]))).toEqual(['a:S1x1', 'b:S1x1'])
  })

  it('keeps stored order and sizes, drops missing devices and appends new ones at 1×1', () => {
    const entries = [
      { deviceId: 'b', size: 'L2x2' as const },
      { deviceId: 'gone', size: 'S1x1' as const },
      { deviceId: 'a', size: 'W2x1' as const },
    ]
    expect(view(reconcileLayout(entries, [a, b, c]))).toEqual(['b:L2x2', 'a:W2x1', 'c:S1x1'])
  })

  it('drops a device that moved out of the tab', () => {
    const entries = [{ deviceId: 'a', size: 'L2x2' as const }, { deviceId: 'b', size: 'S1x1' as const }]
    expect(view(reconcileLayout(entries, [b]))).toEqual(['b:S1x1'])
  })

  it('uses the live device object, not a stale one', () => {
    const fresh = deviceFixture({ id: 'a', name: 'Renamed' })
    expect(reconcileLayout([{ deviceId: 'a', size: 'S1x1' }], [fresh])[0].device).toBe(fresh)
  })
})

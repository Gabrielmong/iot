import { deviceFixture } from '../../test/deviceFixtures'
import { visibleTiles } from './visibleTiles'

describe('visibleTiles', () => {
  it('hides a strip whose outlets are visible, keeping the outlets', () => {
    const strip = deviceFixture({ id: 'strip', name: 'KP303' })
    const a = deviceFixture({ id: 'o1', name: 'Lamp outlet', parentId: 'strip' })
    const b = deviceFixture({ id: 'o2', name: 'Fan outlet', parentId: 'strip' })
    expect(visibleTiles([strip, a, b]).map((d) => d.id)).toEqual(['o1', 'o2'])
  })

  it('keeps a parent with no visible children', () => {
    const strip = deviceFixture({ id: 'strip' })
    expect(visibleTiles([strip]).map((d) => d.id)).toEqual(['strip'])
  })
})

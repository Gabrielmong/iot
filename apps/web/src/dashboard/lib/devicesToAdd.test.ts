import { deviceFixture } from '../../test/deviceFixtures'
import { devicesToAdd } from './devicesToAdd'
import type { ArrangedTile } from './reconcileLayout'

const porchRoom = { id: 'r1', name: 'Porch', sortOrder: 1 }
const kitchenRoom = { id: 'r2', name: 'Kitchen', sortOrder: 0 }
const porch = deviceFixture({ id: 'd-porch', name: 'Porch light', room: porchRoom })
const fan = deviceFixture({ id: 'd-fan', name: 'Fan', room: porchRoom })
const kettle = deviceFixture({ id: 'd-kettle', name: 'Kettle', room: kitchenRoom })
const radio = deviceFixture({ id: 'd-radio', name: 'Radio', room: null })
const rooms = [porchRoom, kitchenRoom]

describe('devicesToAdd', () => {
  it('groups by room in room order, devices by name, roomless last', () => {
    expect(devicesToAdd([porch, radio, kettle, fan], [], rooms)).toEqual([
      { room: 'Kitchen', devices: [kettle] },
      { room: 'Porch', devices: [fan, porch] },
      { room: 'No room', devices: [radio] },
    ])
  })

  it('leaves out devices already placed and rooms left empty', () => {
    const placed: ArrangedTile[] = [{ key: 'd-kettle', device: kettle, size: 'S1x1' }, { key: 'widget:w1', widget: 'CLOCK', widgetId: 'w1', size: 'W2x1' }]
    expect(devicesToAdd([porch, kettle], placed, rooms)).toEqual([{ room: 'Porch', devices: [porch] }])
  })
})

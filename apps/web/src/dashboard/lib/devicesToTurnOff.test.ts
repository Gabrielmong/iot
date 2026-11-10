import { deviceFixture, lightFixture } from '../../test/deviceFixtures'
import { devicesToTurnOff } from './devicesToTurnOff'

describe('devicesToTurnOff', () => {
  it('picks the lights, switches and plugs that are on and can be toggled', () => {
    const lamp = lightFixture({}, { id: 'lamp' })
    const plug = deviceFixture({ id: 'plug', kind: 'PLUG', on: true })
    expect(devicesToTurnOff([lamp, plug]).map((d) => d.id)).toEqual(['lamp', 'plug'])
  })

  it('skips devices that are already off, offline, need setup or are cameras', () => {
    const skipped = [
      lightFixture({ on: false }),
      deviceFixture({ on: false }),
      deviceFixture({ on: true, online: false }),
      deviceFixture({ on: true, status: 'NEEDS_KEY' }),
      deviceFixture({ on: true, kind: 'CAMERA' }),
    ]
    expect(devicesToTurnOff(skipped)).toEqual([])
  })
})

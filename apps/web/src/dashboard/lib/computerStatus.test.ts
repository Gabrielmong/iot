import { computerFixture, deviceFixture } from '../../test/deviceFixtures'
import type { WakeStatus } from '../../gql/graphql'
import { computerStatus } from './computerStatus'

const pc = (status: WakeStatus | null, seconds: number | null = null) =>
  deviceFixture({
    kind: 'COMPUTER',
    brand: 'WOL',
    computer: computerFixture({ wake: status && { status, seconds } }),
  })

describe('computerStatus', () => {
  it.each([
    ['WAKING', null, 'Waking…'],
    ['WOKE', 23, 'On after 23 s'],
    ['FAILED', null, "Didn't wake"],
    ['UNCONFIRMED', null, "Wake sent, can't confirm"],
  ] as const)('%s → %s', (status, seconds, text) => {
    expect(computerStatus(pc(status, seconds))).toBe(text)
  })

  it('is null without a wake, and for other devices', () => {
    expect(computerStatus(pc(null))).toBeNull()
    expect(computerStatus(deviceFixture())).toBeNull()
  })
})

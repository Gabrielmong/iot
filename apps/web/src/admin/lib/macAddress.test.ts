import { isValidMac } from './macAddress'

describe('isValidMac', () => {
  it.each(['AA:BB:CC:DD:EE:FF', 'aa-bb-cc-dd-ee-ff', 'aabbccddeeff', 'aabb.ccdd.eeff', ' AA:BB:CC:DD:EE:FF '])('accepts %s', (mac) => {
    expect(isValidMac(mac)).toBe(true)
  })

  it.each(['nope', 'AA:BB:CC:DD:EE', 'GG:BB:CC:DD:EE:FF', ''])('rejects %j', (mac) => {
    expect(isValidMac(mac)).toBe(false)
  })
})

import { connectionLabel } from './connectionLabel'

describe('connectionLabel', () => {
  it('labels LAN and cloud devices', () => {
    expect(connectionLabel({ connection: 'LOCAL' })).toBe('Local (LAN)')
    expect(connectionLabel({ connection: 'CLOUD' })).toBe('via Tuya cloud')
  })
})

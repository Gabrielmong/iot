import { rdpLink } from './rdpLink'

it('builds an rdp:// link with the full address', () => {
  expect(rdpLink('192.168.0.150')).toBe('rdp://full%20address=s:192.168.0.150')
})

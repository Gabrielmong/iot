import { mseSocketUrl, webrtcPath } from './cameraPaths'

const loc = { protocol: 'https:', host: 'home.lan' }

describe('cameraPaths', () => {
  it('asks for the main stream by default', () => {
    expect(webrtcPath('cam 1')).toBe('/api/cameras/cam%201/webrtc')
    expect(mseSocketUrl('cam1', loc)).toBe('wss://home.lan/api/cameras/cam1/mse')
  })

  it('asks for the light sub-stream when told to', () => {
    expect(webrtcPath('cam1', 'sub')).toBe('/api/cameras/cam1/webrtc?quality=sub')
    expect(mseSocketUrl('cam1', loc, 'sub')).toBe('wss://home.lan/api/cameras/cam1/mse?quality=sub')
  })
})

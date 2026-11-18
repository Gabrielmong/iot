import { openUrl } from '../openUrl'
import { openRdpFile } from './openRdpFile'
import { openRemoteDesktop } from './openRemoteDesktop'

vi.mock('../openUrl', () => ({ openUrl: vi.fn() }))
vi.mock('./openRdpFile', () => ({ openRdpFile: vi.fn() }))

describe('openRemoteDesktop', () => {
  beforeEach(() => vi.clearAllMocks())

  it("opens a home-rdp:// link when the viewer's PC has the HomeAgent", () => {
    openRemoteDesktop('192.168.0.100', 'Server', true)
    expect(openUrl).toHaveBeenCalledWith('home-rdp://192.168.0.100')
    expect(openRdpFile).not.toHaveBeenCalled()
  })

  it('falls back to the .rdp file anywhere else', () => {
    openRemoteDesktop('192.168.0.100', 'Server', false)
    expect(openRdpFile).toHaveBeenCalledWith('192.168.0.100', 'Server')
    expect(openUrl).not.toHaveBeenCalled()
  })
})

import { openRdpFile } from './openRdpFile'

describe('openRdpFile', () => {
  afterEach(() => {
    delete window.HomeApp
    vi.restoreAllMocks()
  })

  it('hands the file to the Android app when its bridge is there', () => {
    const openRdp = vi.fn()
    window.HomeApp = { openRdp }
    openRdpFile('192.168.0.100', 'Server')
    expect(openRdp).toHaveBeenCalledWith(expect.stringContaining('full address:s:192.168.0.100'), 'Server.rdp')
  })

  it('downloads the file in a browser', async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:rdp')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('blob:rdp')
      expect(this.download).toBe('Server.rdp')
    })
    openRdpFile('192.168.0.100', 'Server')
    expect(click).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0]
    expect(blob.type).toBe('application/x-rdp')
    expect(await blob.text()).toContain('full address:s:192.168.0.100')
  })
})

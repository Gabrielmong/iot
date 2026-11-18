import { rdpFileContents, rdpFileName } from './rdpFile'

describe('rdpFileContents', () => {
  it('points Remote Desktop at the address, one CRLF-ended setting per line', () => {
    const lines = rdpFileContents('192.168.0.100').split('\r\n')
    expect(lines).toContain('full address:s:192.168.0.100')
    expect(lines.at(-1)).toBe('')
  })
})

describe('rdpFileName', () => {
  it("is the PC's name with characters a file name can't hold removed", () => {
    expect(rdpFileName('Office PC: "main"')).toBe('Office PC main.rdp')
  })

  it('falls back when nothing usable is left', () => {
    expect(rdpFileName('***')).toBe('Remote Desktop.rdp')
  })
})

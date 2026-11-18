import { rdpFileContents, rdpFileName } from './rdpFile'

declare global {
  interface Window {
    /** Added by the Home Android app's WebView: hands the file to the phone's Remote Desktop app. */
    HomeApp?: { openRdp(contents: string, fileName: string): void }
  }
}

/** Opens Remote Desktop to `address`: through the Android app's bridge, otherwise by downloading a `.rdp` file. */
export function openRdpFile(address: string, pcName: string): void {
  const contents = rdpFileContents(address)
  const fileName = rdpFileName(pcName)
  if (window.HomeApp?.openRdp) return window.HomeApp.openRdp(contents, fileName)
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/x-rdp' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

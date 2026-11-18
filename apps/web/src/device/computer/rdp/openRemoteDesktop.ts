import { openUrl } from '../openUrl'
import { openRdpFile } from './openRdpFile'

/**
 * Opens Remote Desktop to `address`. On a PC running the HomeAgent (`launch`), a `home-rdp://` link starts
 * Remote Desktop Connection directly; anywhere else, the `.rdp` file does.
 */
export function openRemoteDesktop(address: string, pcName: string, launch: boolean): void {
  if (launch) openUrl(`home-rdp://${address}`)
  else openRdpFile(address, pcName)
}

/**
 * A Remote Desktop connection file. Windows' Remote Desktop Connection and Microsoft's mobile apps open these;
 * nothing on Windows opens `rdp://` links, which browsers can't even parse.
 */
export function rdpFileContents(address: string): string {
  return ['full address:s:' + address, 'screen mode id:i:2', 'prompt for credentials:i:1', ''].join('\r\n')
}

/** `<PC name>.rdp`, keeping only characters every OS allows in a file name. */
export function rdpFileName(pcName: string): string {
  const safe = pcName.replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim()
  return `${safe || 'Remote Desktop'}.rdp`
}

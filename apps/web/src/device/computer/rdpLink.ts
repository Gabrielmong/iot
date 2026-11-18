/** A link the Remote Desktop app opens (Windows' Remote Desktop app, the Android RD client). */
export const rdpLink = (address: string): string => `rdp://full%20address=s:${address}`

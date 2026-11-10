/** The server's message for a MAC it can't read (kept identical so the form says the same thing). */
export const MAC_MESSAGE = 'Enter a MAC address like AA:BB:CC:DD:EE:FF'

/** Mirrors the server's parseMac: 12 hex digits once ":", "-" and "." are removed. */
export const isValidMac = (input: string): boolean => /^[0-9a-f]{12}$/i.test(input.trim().replace(/[:.-]/g, ''))

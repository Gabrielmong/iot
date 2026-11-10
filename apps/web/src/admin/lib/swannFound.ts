export const SWANN_DEFAULT_HOST = '192.168.0.198'
export const SWANN_H265_NOTE = 'Some cameras use H.265 and will be converted for browsers (uses more server CPU).'

export type SwannFound = { channels: number; codecs: string[] }

/** "Found N cameras" (singular for one). */
export function swannFoundText({ channels }: SwannFound): string {
  return `Found ${channels} ${channels === 1 ? 'camera' : 'cameras'}`
}

export function usesH265({ codecs }: SwannFound): boolean {
  return codecs.includes('H265')
}

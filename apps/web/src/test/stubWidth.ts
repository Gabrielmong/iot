import { vi } from 'vitest'

/** Makes MUI's useMediaQuery see a desktop (true) or a phone (false) screen. */
export function stubWidth(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
}

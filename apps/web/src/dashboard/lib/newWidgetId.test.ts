import { newWidgetId } from './newWidgetId'

afterEach(() => vi.unstubAllGlobals())

describe('newWidgetId', () => {
  it('works without crypto.randomUUID (plain http on the home network)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const a = newWidgetId()
    const b = newWidgetId()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toBe(b)
  })
})

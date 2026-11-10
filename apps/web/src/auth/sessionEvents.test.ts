import { getToken, setToken } from './session'
import { endSession, onSessionEnded } from './sessionEvents'

describe('endSession', () => {
  it('clears the token and notifies listeners until unsubscribed', () => {
    const listener = vi.fn()
    const off = onSessionEnded(listener)
    setToken('t')
    endSession()
    expect(getToken()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    endSession()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

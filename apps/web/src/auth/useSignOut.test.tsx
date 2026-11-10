import type { MockLink } from '@apollo/client/testing'
import { MockedProvider } from '@apollo/client/testing/react'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LOGOUT } from './documents'
import { getToken, setToken } from './session'
import { useSignOut } from './useSignOut'

const wrap = (mocks: MockLink.MockedResponse[]) => ({ children }: { children: ReactNode }) => (
  <MockedProvider mocks={mocks}>{children}</MockedProvider>
)

describe('useSignOut', () => {
  it('calls logout then clears the token', async () => {
    let called = false
    setToken('t')
    const { result } = renderHook(() => useSignOut(), {
      wrapper: wrap([
        { request: { query: LOGOUT }, result: () => { called = true; return { data: { logout: true } } } },
      ]),
    })
    await result.current()
    expect(called).toBe(true)
    expect(getToken()).toBeNull()
  })

  it('still clears the token when the mutation fails', async () => {
    setToken('t')
    const { result } = renderHook(() => useSignOut(), {
      wrapper: wrap([{ request: { query: LOGOUT }, error: new Error('offline') }]),
    })
    await result.current()
    expect(getToken()).toBeNull()
  })
})

import type { MockLink } from '@apollo/client/testing'
import { MockedProvider } from '@apollo/client/testing/react'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ME } from './documents'
import { useSessionPing } from './useSessionPing'

const wrap = (mocks: MockLink.MockedResponse[]) => ({ children }: { children: ReactNode }) => (
  <MockedProvider mocks={mocks}>{children}</MockedProvider>
)
const me = { me: { __typename: 'User', id: 'u1', name: 'Ann', avatarColor: '#fff', avatarImage: null, role: 'USER', hasPin: true } }

describe('useSessionPing', () => {
  it('sends the me query to the server', async () => {
    let calls = 0
    const { result } = renderHook(() => useSessionPing(), {
      wrapper: wrap([{ request: { query: ME }, result: () => { calls++; return { data: me } } }]),
    })
    result.current()
    await waitFor(() => expect(calls).toBe(1))
  })

  it('swallows a failed ping', async () => {
    const { result } = renderHook(() => useSessionPing(), {
      wrapper: wrap([{ request: { query: ME }, error: new Error('offline') }]),
    })
    expect(() => result.current()).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
  })
})

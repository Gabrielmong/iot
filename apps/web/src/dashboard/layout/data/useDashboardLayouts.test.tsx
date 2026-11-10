import { ApolloProvider } from '@apollo/client/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { of } from 'rxjs'
import { createTestClient, failWith, type Handler } from '../../../test/testClient'
import { useDashboardLayouts } from './useDashboardLayouts'

const layout = (tab: string, isDefault = false) => ({
  __typename: 'DashboardLayout',
  tab,
  isDefault,
  items: [{ __typename: 'LayoutItem', deviceId: 'a', size: 'L2x2' }],
})

function setup(extra: Record<string, Handler> = {}) {
  const client = createTestClient({
    DashboardLayouts: () => of({ data: { dashboardLayouts: [layout('all', true)] } }),
    ...extra,
  })
  const wrapper = ({ children }: { children: ReactNode }) => <ApolloProvider client={client}>{children}</ApolloProvider>
  return renderHook(() => useDashboardLayouts(), { wrapper })
}

describe('useDashboardLayouts', () => {
  it('returns the layout for a tab, and undefined for a tab without one', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.layoutFor('all')).toBeDefined())
    expect(result.current.layoutFor('all')).toEqual({ entries: [{ deviceId: 'a', size: 'L2x2' }], isDefault: true })
    expect(result.current.layoutFor('room-1')).toBeUndefined()
  })

  it('saves a tab and resolves true', async () => {
    const sent: unknown[] = []
    const { result } = setup({
      SaveDashboardLayout: (op) => {
        sent.push(op.variables)
        return of({ data: { saveDashboardLayout: layout('all') } })
      },
    })
    let ok = false
    await act(async () => {
      ok = await result.current.save('all', [{ deviceId: 'a', size: 'L2x2' }], false)
    })
    expect(ok).toBe(true)
    expect(sent).toEqual([{ tab: 'all', items: [{ deviceId: 'a', size: 'L2x2' }], asDefault: false }])
  })

  it('resolves false when saving fails', async () => {
    const { result } = setup({ SaveDashboardLayout: failWith('BAD_USER_INPUT') })
    let ok = true
    await act(async () => {
      ok = await result.current.save('all', [], false)
    })
    expect(ok).toBe(false)
  })

  it('resets a tab and resolves true', async () => {
    const sent: unknown[] = []
    const { result } = setup({
      ResetDashboardLayout: (op) => {
        sent.push(op.variables)
        return of({ data: { resetDashboardLayout: null } })
      },
    })
    let ok = false
    await act(async () => {
      ok = await result.current.reset('all')
    })
    expect(ok).toBe(true)
    expect(sent).toEqual([{ tab: 'all' }])
  })
})

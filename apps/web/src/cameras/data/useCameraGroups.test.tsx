import { ApolloProvider } from '@apollo/client/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { cameraGroupFixture } from '../../test/cameraGroupFixtures'
import { createTestClient, liveSubscription, reply } from '../../test/testClient'
import { useCameraGroups } from './useCameraGroups'

describe('useCameraGroups', () => {
  it('splits groups into mine and shared, and refetches when they change', async () => {
    let groups = [cameraGroupFixture({ id: 'a', name: 'Mine' }), cameraGroupFixture({ id: 'b', name: 'Ours', scope: 'SHARED' })]
    const changed = liveSubscription()
    const client = createTestClient({
      CameraGroups: (op) => reply({ cameraGroups: groups })(op),
      OtherCameraGroups: reply({ otherCameraGroups: [cameraGroupFixture({ id: 'c', name: 'Anns' })] }),
      CameraGroupsChanged: changed.handler,
    })
    const wrapper = ({ children }: { children: ReactNode }) => <ApolloProvider client={client}>{children}</ApolloProvider>
    const { result } = renderHook(() => useCameraGroups(true), { wrapper })
    await waitFor(() => expect(result.current.mine.map((g) => g.name)).toEqual(['Mine']))
    expect(result.current.shared.map((g) => g.name)).toEqual(['Ours'])
    await waitFor(() => expect(result.current.others.map((g) => g.name)).toEqual(['Anns']))
    groups = [...groups, cameraGroupFixture({ id: 'd', name: 'New' })]
    act(() => changed.next({ cameraGroupsChanged: true }))
    await waitFor(() => expect(result.current.mine.map((g) => g.name)).toEqual(['Mine', 'New']))
  })
})

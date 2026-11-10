import { ApolloProvider } from '@apollo/client/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { cameraControlsFixture } from '../../test/cameraControlsFixtures'
import { createTestClient, failWith, reply, type Handler } from '../../test/testClient'
import { useCameraControls } from './useCameraControls'

function setup(handlers: Record<string, Handler>) {
  const client = createTestClient(handlers)
  const wrapper = ({ children }: { children: ReactNode }) => <ApolloProvider client={client}>{children}</ApolloProvider>
  return renderHook(() => useCameraControls('cam1'), { wrapper })
}

describe('useCameraControls', () => {
  it('controls is null when the query returns null', async () => {
    const { result } = setup({ CameraControls: reply({ cameraControls: null }) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.controls).toBeNull()
  })

  it('setSettings updates controls from the mutation result', async () => {
    const before = cameraControlsFixture()
    const after = cameraControlsFixture({ settings: { ...before.settings!, flip: true } })
    const sent: unknown[] = []
    const { result } = setup({
      CameraControls: reply({ cameraControls: before }),
      SetCameraSettings: (op) => {
        sent.push(op.variables)
        return reply({ setCameraSettings: after })(op)
      },
    })
    await waitFor(() => expect(result.current.controls?.settings?.flip).toBe(false))
    await act(() => result.current.setSettings({ flip: true }))
    expect(sent).toEqual([{ deviceId: 'cam1', settings: { flip: true } }])
    expect(result.current.controls?.settings?.flip).toBe(true)
  })

  it('a TUYA_CLOUD_ERROR sets error to "Couldn\'t reach the camera", and the next success clears it', async () => {
    let fail = true
    const { result } = setup({
      CameraControls: reply({ cameraControls: cameraControlsFixture() }),
      StopCamera: (op) => (fail ? failWith('TUYA_CLOUD_ERROR')(op) : reply({ stopCamera: true })(op)),
    })
    await waitFor(() => expect(result.current.controls).not.toBeNull())
    await act(() => result.current.stop())
    expect(result.current.error).toBe("Couldn't reach the camera")
    fail = false
    await act(() => result.current.stop())
    expect(result.current.error).toBeNull()
  })

  it('a FORBIDDEN error shows the server message', async () => {
    const { result } = setup({
      CameraControls: reply({ cameraControls: cameraControlsFixture() }),
      SetCameraSettings: () => failWith('FORBIDDEN')({} as never),
    })
    await waitFor(() => expect(result.current.controls).not.toBeNull())
    await act(() => result.current.setSettings({ privacy: true }))
    expect(result.current.error).toBe('FORBIDDEN')
  })
})

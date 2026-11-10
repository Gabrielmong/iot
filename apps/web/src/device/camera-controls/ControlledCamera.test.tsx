import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { cameraControlsFixture } from '../../test/cameraControlsFixtures'
import { createTestClient, failWith, reply, type Handler } from '../../test/testClient'
import { ControlledCamera } from './ControlledCamera'

vi.mock('../camera/CameraPlayer', () => ({
  CameraPlayer: ({ overlay }: { overlay?: ReactNode }) => (
    <div data-testid="player">
      <video aria-label="Live video" />
      {overlay}
    </div>
  ),
}))

function setup(handlers: Record<string, Handler>, brand = 'TUYA') {
  const client = createTestClient(handlers)
  render(
    <ApolloProvider client={client}>
      <ControlledCamera deviceId="cam1" brand={brand} cloud />
    </ApolloProvider>,
  )
}

const privacyOn = (supported: string[]) =>
  cameraControlsFixture({ supported, settings: { ...cameraControlsFixture().settings!, privacy: true } })

describe('ControlledCamera', () => {
  it('a camera with no controls renders just the player', async () => {
    setup({ CameraControls: reply({ cameraControls: null }) })
    expect(await screen.findByTestId('player')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull())
    expect(screen.queryByRole('button', { name: /Night vision/ })).toBeNull()
  })

  it('a non-Tuya camera never asks for controls', () => {
    setup({}, 'SWANN')
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })

  it('shows the arrows over the video and the chips below', async () => {
    setup({ CameraControls: reply({ cameraControls: cameraControlsFixture() }) })
    expect(await screen.findByRole('button', { name: 'Move up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Night vision/ })).toBeInTheDocument()
  })

  it.each([
    ['a user', ['nightVision', 'flip']],
    ['an admin', ['nightVision', 'privacy', 'flip']],
  ])('privacy on shows "Privacy mode is on" and no video, for %s', async (_who, supported) => {
    setup({ CameraControls: reply({ cameraControls: privacyOn(supported) }) })
    expect(await screen.findByText('Privacy mode is on')).toBeInTheDocument()
    expect(screen.queryByLabelText('Live video')).toBeNull()
  })

  it('an admin can turn privacy off from the chip', async () => {
    const sent: unknown[] = []
    setup({
      CameraControls: reply({ cameraControls: privacyOn(['nightVision', 'privacy']) }),
      SetCameraSettings: (op) => {
        sent.push(op.variables)
        return reply({ setCameraSettings: cameraControlsFixture({ supported: ['nightVision', 'privacy'] }) })(op)
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Privacy' }))
    await waitFor(() => expect(sent).toEqual([{ deviceId: 'cam1', settings: { privacy: false } }]))
    expect(await screen.findByTestId('player')).toBeInTheDocument()
  })

  it('a user sees no Privacy chip', async () => {
    setup({ CameraControls: reply({ cameraControls: cameraControlsFixture() }) })
    await screen.findByRole('button', { name: /Night vision/ })
    expect(screen.queryByRole('button', { name: 'Privacy' })).toBeNull()
  })

  it('unreadable settings disable the chips with a note', async () => {
    setup({ CameraControls: reply({ cameraControls: cameraControlsFixture({ settings: null }) }) })
    expect(await screen.findByText("Couldn't read the camera's settings")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Flip image/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('a failed command shows the error under the video, and the video stays', async () => {
    setup({ CameraControls: reply({ cameraControls: cameraControlsFixture() }), SetCameraSettings: failWith('TUYA_CLOUD_ERROR') })
    fireEvent.click(await screen.findByRole('button', { name: /Flip image/ }))
    expect(await screen.findByText("Couldn't reach the camera")).toBeInTheDocument()
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })
})

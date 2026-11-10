import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { of } from 'rxjs'
import { setToken } from '../../auth/session'
import { userFixture } from '../../test/adminFixtures'
import { deviceFixture } from '../../test/deviceFixtures'
import { createTestClient, failWith, type Handler, liveSubscription, reply } from '../../test/testClient'
import { DevicePage } from '../../pages/DevicePage'

const REGION = 'Local stream (ONVIF)'

const detail = (extra: Record<string, unknown> = {}) => ({
  ...deviceFixture({ id: 'd1', name: 'Cámara cocina', brand: 'TUYA', kind: 'CAMERA' }),
  lastSeenAt: new Date().toISOString(),
  connection: 'CLOUD',
  streamSource: 'CLOUD',
  ip: '192.168.0.217',
  model: null,
  ...extra,
})

const switched = (source: 'LOCAL' | 'CLOUD') => ({ __typename: 'Device', id: 'd1', connection: source, streamSource: source })

function setup(role: 'ADMIN' | 'USER', device: Record<string, unknown>, extra: Record<string, Handler> = {}) {
  setToken('t')
  const client = createTestClient({
    Me: reply({ me: role === 'ADMIN' ? userFixture('a1', 'Gabriel', 'ADMIN') : userFixture('u1', 'Ana') }),
    Device: reply({ device }),
    DeviceState: liveSubscription().handler,
    ...extra,
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={['/devices/d1']}>
        <Routes>
          <Route path="/devices/:id" element={<DevicePage />} />
        </Routes>
      </MemoryRouter>
    </ApolloProvider>,
  )
}

async function section() {
  return within(await screen.findByRole('region', { name: REGION }))
}

describe('OnvifLocalSection', () => {
  it('is shown to an admin on a Tuya camera, with username admin and a masked password', async () => {
    setup('ADMIN', detail())
    const s = await section()
    expect(s.getByText('Camera address: 192.168.0.217')).toBeInTheDocument()
    expect(s.getByLabelText('Username')).toHaveValue('admin')
    expect(s.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(s.getByLabelText('Password')).toHaveValue('')
    expect(s.getByRole('button', { name: 'Test & switch to local' })).toBeDisabled()
  })

  it('requires confirming the shown address before switching', async () => {
    setup('ADMIN', detail())
    const s = await section()
    fireEvent.change(s.getByLabelText('Password'), { target: { value: 'pw1' } })
    const button = s.getByRole('button', { name: 'Test & switch to local' })
    expect(button).toBeDisabled()
    fireEvent.click(s.getByRole('checkbox', { name: "This is the camera's address" }))
    expect(button).toBeEnabled()
  })

  it.each([
    ['a USER', 'USER' as const, detail()],
    ['a Swann camera', 'ADMIN' as const, detail({ brand: 'SWANN', streamSource: 'LOCAL', connection: 'LOCAL' })],
    ['a Tuya plug', 'ADMIN' as const, detail({ kind: 'PLUG', streamSource: null, connection: 'LOCAL' })],
  ])('is hidden for %s', async (_, role, device) => {
    setup(role, device)
    await screen.findByRole('heading', { name: 'Cámara cocina' })
    expect(screen.queryByRole('region', { name: REGION })).not.toBeInTheDocument()
  })

  it('switches to local and then shows Streaming locally', async () => {
    const calls: unknown[] = []
    setup('ADMIN', detail(), {
      SetCameraOnvif: (op) => {
        calls.push(op.variables)
        return of({ data: { setCameraOnvif: switched('LOCAL') } })
      },
    })
    const s = await section()
    fireEvent.change(s.getByLabelText('Password'), { target: { value: 'pw1' } })
    fireEvent.click(s.getByRole('checkbox', { name: "This is the camera's address" }))
    fireEvent.click(s.getByRole('button', { name: 'Test & switch to local' }))
    expect(await s.findByText('Streaming locally')).toBeInTheDocument()
    expect(calls).toEqual([{ deviceId: 'd1', username: 'admin', password: 'pw1', confirmAddress: '192.168.0.217' }])
    expect(s.getByRole('button', { name: 'Switch back to cloud' })).toBeInTheDocument()
  })

  it.each([
    ['ONVIF_AUTH_FAILED', /rejected that username or password/],
    ['ONVIF_UNREACHABLE', /didn't answer over ONVIF/],
    ['ONVIF_NO_STREAM', /no usable local stream/],
    ['ONVIF_CAMERA_NOT_CONFIRMED', /Wait until the camera shows online/],
  ])('shows friendly copy for %s', async (code, text) => {
    setup('ADMIN', detail(), { SetCameraOnvif: failWith(code) })
    const s = await section()
    fireEvent.change(s.getByLabelText('Password'), { target: { value: 'pw1' } })
    fireEvent.click(s.getByRole('checkbox', { name: "This is the camera's address" }))
    fireEvent.click(s.getByRole('button', { name: 'Test & switch to local' }))
    expect(await s.findByText(text)).toBeInTheDocument()
    expect(s.queryByText('Streaming locally')).not.toBeInTheDocument()
  })

  it('switches a local camera back to the cloud', async () => {
    const calls: unknown[] = []
    setup('ADMIN', detail({ streamSource: 'LOCAL', connection: 'LOCAL' }), {
      ClearCameraOnvif: (op) => {
        calls.push(op.variables)
        return of({ data: { clearCameraOnvif: switched('CLOUD') } })
      },
    })
    const s = await section()
    expect(s.getByText('Streaming locally')).toBeInTheDocument()
    fireEvent.click(s.getByRole('button', { name: 'Switch back to cloud' }))
    expect(await s.findByRole('button', { name: 'Test & switch to local' })).toBeInTheDocument()
    await waitFor(() => expect(calls).toEqual([{ deviceId: 'd1' }]))
  })
})

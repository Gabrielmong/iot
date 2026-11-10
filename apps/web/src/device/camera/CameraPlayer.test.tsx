import { act, fireEvent, render, screen } from '@testing-library/react'
import { setToken } from '../../auth/session'
import { onSessionEnded } from '../../auth/sessionEvents'
import {
  FakeMediaSource,
  FakePeerConnection,
  FakeWebSocket,
  installMediaStubs,
  resetDocumentVisibility,
  setDocumentVisible,
} from '../../test/mediaStubs'
import { CameraPreview } from '../preview/CameraPreview'
import { CameraPlayer } from './CameraPlayer'

const answer = () => new Response('v=0 answer', { status: 200, headers: { 'Content-Type': 'application/sdp' } })
const status = (code: number) => new Response(JSON.stringify({ code: 'X' }), { status: code })
const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)))
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

let fetchMock: ReturnType<typeof vi.fn>
let urls: ReturnType<typeof installMediaStubs>

beforeEach(() => {
  vi.useFakeTimers()
  setToken('tok')
  urls = installMediaStubs()
  fetchMock = vi.fn(async () => answer())
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetDocumentVisibility()
})

const pcs = () => FakePeerConnection.instances
const sockets = () => FakeWebSocket.instances
const lastPc = () => pcs()[pcs().length - 1]!

/** Renders the player with WebRTC signalling failing at the network, and opens the MSE socket. */
async function renderOnMse() {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  const view = render(<CameraPlayer deviceId="cam1" />)
  await flush()
  const ws = sockets()[0]!
  act(() => ws.open())
  return { ...view, ws }
}

describe('CameraPlayer: WebRTC', () => {
  it('offers recvonly video and audio, posts the offer with the session token and applies the answer', async () => {
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    const pc = lastPc()
    expect(pc.transceivers).toEqual([
      { kind: 'video', direction: 'recvonly' },
      { kind: 'audio', direction: 'recvonly' },
    ])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/cameras/cam1/webrtc')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('v=0 offer')
    const headers = new Headers(init.headers)
    expect(headers.get('content-type')).toBe('application/sdp')
    expect(headers.get('authorization')).toBe('Bearer tok')
    expect(headers.get('x-home-background')).toBeNull()
    expect(pc.remoteDescription).toEqual({ type: 'answer', sdp: 'v=0 answer' })
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
    act(() => pc.setConnectionState('connected'))
    expect(screen.queryByText('Connecting…')).not.toBeInTheDocument()
    expect(sockets()).toHaveLength(0)
  })

  it('falls back to MSE on a 503 that is not the cloud refusing (go2rtc may still serve MSE)', async () => {
    fetchMock.mockResolvedValue(status(503))
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    expect(lastPc().closed).toBe(true)
    expect(sockets()).toHaveLength(1)
    expect(screen.queryByText('Camera unavailable')).not.toBeInTheDocument()
    const ws = sockets()[0]!
    act(() => ws.open())
    act(() => ws.receive(JSON.stringify({ type: 'mse', value: 'video/mp4; codecs="avc1.640029,mp4a.40.2"' })))
    expect(screen.queryByText('Connecting…')).not.toBeInTheDocument()
  })

  it('shows "Camera unavailable" when MSE fails too after a 503', async () => {
    fetchMock.mockResolvedValue(status(503))
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    act(() => sockets()[0]!.open())
    act(() => sockets()[0]!.serverClose(4503))
    expect(screen.getByText('Camera unavailable')).toBeInTheDocument()
  })

  it('shows "Camera unavailable" on 404 without trying MSE', async () => {
    fetchMock.mockResolvedValue(status(404))
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    expect(screen.getByText('Camera unavailable')).toBeInTheDocument()
    expect(sockets()).toHaveLength(0)
  })

  it('falls back to MSE when the peer connection fails before playing', async () => {
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    act(() => lastPc().setConnectionState('failed'))
    await flush()
    expect(lastPc().closed).toBe(true)
    expect(sockets()).toHaveLength(1)
  })

  it('ends the session on 401', async () => {
    const ended = vi.fn()
    const off = onSessionEnded(ended)
    fetchMock.mockResolvedValue(status(401))
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    off()
    expect(ended).toHaveBeenCalledTimes(1)
    expect(sockets()).toHaveLength(0)
  })

  it('falls back to MSE when the connection does not come up within 10 s', async () => {
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    await advance(9_999)
    expect(sockets()).toHaveLength(0)
    await advance(1)
    expect(lastPc().closed).toBe(true)
    expect(sockets()).toHaveLength(1)
  })

  it('retries signalling once, 2 s after a disconnect', async () => {
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    act(() => lastPc().setConnectionState('connected'))
    act(() => lastPc().setConnectionState('disconnected'))
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
    expect(pcs()[0]!.closed).toBe(true)
    await advance(1_999)
    expect(pcs()).toHaveLength(1)
    await advance(1)
    expect(pcs()).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops with "Camera unavailable" when the retry gets 404 (never loops)', async () => {
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    act(() => lastPc().setConnectionState('connected'))
    fetchMock.mockResolvedValue(status(404))
    act(() => lastPc().setConnectionState('failed'))
    await advance(2_000)
    expect(screen.getByText('Camera unavailable')).toBeInTheDocument()
    await advance(60_000)
    expect(pcs()).toHaveLength(2)
    expect(sockets()).toHaveLength(0)
  })
})

describe('CameraPlayer: MSE fallback', () => {
  it('falls back to MSE when the WebRTC POST rejects, speaking the go2rtc MSE protocol', async () => {
    const { ws } = await renderOnMse()
    expect(lastPc().closed).toBe(true)
    expect(ws.url).toBe(`ws://${location.host}/api/cameras/cam1/mse`)
    expect(ws.binaryType).toBe('arraybuffer')
    expect(ws.sent).toEqual([
      JSON.stringify({ authToken: 'tok' }),
      JSON.stringify({ type: 'mse', value: 'avc1.640029,mp4a.40.2' }),
    ])
    act(() => ws.receive(JSON.stringify({ type: 'mse', value: 'video/mp4; codecs="avc1.640029"' })))
    const sb = FakeMediaSource.instances[0]!.buffers[0]!
    expect(sb.mime).toBe('video/mp4; codecs="avc1.640029"')
    expect(screen.queryByText('Connecting…')).not.toBeInTheDocument()
    const segment = new ArrayBuffer(8)
    act(() => ws.receive(segment))
    expect(sb.appended).toEqual([segment])
  })

  it('ends the session when the socket closes with 4401', async () => {
    const ended = vi.fn()
    const off = onSessionEnded(ended)
    const { ws } = await renderOnMse()
    act(() => ws.serverClose(4401))
    off()
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it('shows "Camera unavailable" when the socket closes with 4503', async () => {
    const { ws } = await renderOnMse()
    act(() => ws.serverClose(4503))
    expect(screen.getByText('Camera unavailable')).toBeInTheDocument()
  })

  it('reopens the socket once, 2 s after a playing stream drops', async () => {
    const { ws } = await renderOnMse()
    act(() => ws.receive(JSON.stringify({ type: 'mse', value: 'video/mp4; codecs="avc1.640029"' })))
    act(() => ws.serverClose(1000))
    await advance(2_000)
    expect(sockets()).toHaveLength(2)
    expect(pcs()).toHaveLength(1)
    const retry = sockets()[1]!
    act(() => retry.serverClose(4404))
    expect(screen.getByText('Camera unavailable')).toBeInTheDocument()
    await advance(60_000)
    expect(sockets()).toHaveLength(2)
  })
})

describe('CameraPlayer: lifecycle and controls', () => {
  it('closes the peer connection and socket and revokes the stream URL on unmount', async () => {
    const { ws, unmount } = await renderOnMse()
    unmount()
    expect(pcs()[0]!.closed).toBe(true)
    expect(ws.closed).toBe(true)
    expect(urls.revoked).toEqual(urls.created)
  })

  it('tears down while hidden and reconnects when visible', async () => {
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    act(() => lastPc().setConnectionState('connected'))
    act(() => setDocumentVisible(false))
    expect(pcs()[0]!.closed).toBe(true)
    await advance(30_000)
    expect(pcs()).toHaveLength(1)
    act(() => setDocumentVisible(true))
    await flush()
    expect(pcs()).toHaveLength(2)
    expect(lastPc().closed).toBe(false)
  })

  it('starts muted and toggles sound', async () => {
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    const video = screen.getByLabelText('Live video') as HTMLVideoElement
    expect(video.muted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }))
    expect(video.muted).toBe(false)
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument()
  })

  it('asks for full screen on the player', async () => {
    const request = vi.fn(async () => undefined)
    HTMLElement.prototype.requestFullscreen = request
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
    expect(request).toHaveBeenCalledTimes(1)
    delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen
  })
})

describe('CameraPlayer: Tuya cloud', () => {
  const CLOUD_MESSAGE = 'Cloud stream not available for this camera'
  const cloudRefused = () => new Response(JSON.stringify({ code: 'CLOUD_STREAM_UNAVAILABLE' }), { status: 503 })

  it('shows the cloud message on a 503 CLOUD_STREAM_UNAVAILABLE, without trying MSE', async () => {
    fetchMock.mockResolvedValue(cloudRefused())
    render(<CameraPlayer deviceId="cam1" />)
    await flush()
    expect(screen.getByText(CLOUD_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('Camera unavailable')).not.toBeInTheDocument()
    expect(sockets()).toHaveLength(0)
  })

  it('treats a 4503 close as the cloud refusing for cloud cameras only', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<CameraPlayer deviceId="cam1" cloud />)
    await flush()
    act(() => sockets()[0]!.open())
    act(() => sockets()[0]!.serverClose(4503))
    expect(screen.getByText(CLOUD_MESSAGE)).toBeInTheDocument()
  })

  it('the cloud camera page passes its connection to the player', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<CameraPreview device={{ id: 'cam1', connection: 'CLOUD' } as Parameters<typeof CameraPreview>[0]['device']} />)
    await flush()
    act(() => sockets()[0]!.open())
    act(() => sockets()[0]!.serverClose(4503))
    expect(screen.getByText(CLOUD_MESSAGE)).toBeInTheDocument()
  })
})

describe('CameraPreview', () => {
  const camera = (connection: 'LOCAL' | 'CLOUD') => ({ id: 'cam1', connection }) as Parameters<typeof CameraPreview>[0]['device']

  it("shows the cloud note for cloud cameras", async () => {
    render(<CameraPreview device={camera('CLOUD')} />)
    await flush()
    expect(screen.getByText("Cloud-streamed: won't play when the internet is down.")).toBeInTheDocument()
  })

  it('shows no cloud note for local cameras', async () => {
    render(<CameraPreview device={camera('LOCAL')} />)
    await flush()
    expect(screen.getByRole('region', { name: 'Live view' })).toBeInTheDocument()
    expect(screen.queryByText(/Cloud-streamed/)).not.toBeInTheDocument()
  })
})

import { act, renderHook } from '@testing-library/react'
import { setToken } from '../../auth/session'
import { onSessionEnded } from '../../auth/sessionEvents'
import { resetDocumentVisibility, setDocumentVisible, stubObjectUrls } from '../../test/mediaStubs'
import { useThumbnail } from './useThumbnail'

const frame = (age: string | null, status = 200) =>
  new Response(status === 200 ? 'jpeg' : JSON.stringify({ code: 'X' }), {
    status,
    headers: age === null ? {} : { 'X-Frame-Age': age },
  })

const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)))
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

let fetchMock: ReturnType<typeof vi.fn>
let urls: ReturnType<typeof stubObjectUrls>

beforeEach(() => {
  vi.useFakeTimers()
  setToken('tok')
  urls = stubObjectUrls()
  fetchMock = vi.fn(async () => frame('12'))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetDocumentVisibility()
})

describe('useThumbnail', () => {
  it('fetches the thumbnail with the session token as a background request and reports its age', async () => {
    const { result } = renderHook(() => useThumbnail('cam 1'))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/cameras/cam%201/thumbnail.jpg')
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe('Bearer tok')
    expect(headers.get('x-home-background')).toBe('1')
    expect(result.current).toEqual({ src: 'blob:test/1', ageSeconds: 12, stale: false, cloudUnavailable: false })
  })

  it('polls every 10 s and revokes the replaced blob URL', async () => {
    const { result } = renderHook(() => useThumbnail('cam1'))
    await flush()
    await advance(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.src).toBe('blob:test/2')
    expect(urls.revoked).toEqual(['blob:test/1'])
  })

  it('revokes the blob URL on unmount', async () => {
    const { unmount } = renderHook(() => useThumbnail('cam1'))
    await flush()
    unmount()
    expect(urls.revoked).toEqual(['blob:test/1'])
  })

  it('stops polling while the page is hidden and resumes when visible', async () => {
    renderHook(() => useThumbnail('cam1'))
    await flush()
    act(() => setDocumentVisible(false))
    await advance(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    act(() => setDocumentVisible(true))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await advance(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('is stale, with no image, when the frame is older than 60 s', async () => {
    fetchMock.mockImplementation(async () => frame('61'))
    const { result } = renderHook(() => useThumbnail('cam1'))
    await flush()
    expect(result.current).toEqual({ src: null, ageSeconds: 61, stale: true, cloudUnavailable: false })
  })

  it('is not stale at exactly 60 s', async () => {
    fetchMock.mockImplementation(async () => frame('60'))
    const { result } = renderHook(() => useThumbnail('cam1'))
    await flush()
    expect(result.current.stale).toBe(false)
  })

  it('is stale when the last request failed, even after a good frame', async () => {
    const { result } = renderHook(() => useThumbnail('cam1'))
    await flush()
    fetchMock.mockImplementation(async () => frame(null, 503))
    await advance(10_000)
    expect(result.current.stale).toBe(true)
    expect(result.current.src).toBeNull()
  })

  it('reports the Tuya cloud refusing the stream, until a frame arrives', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ code: 'CLOUD_STREAM_UNAVAILABLE' }), { status: 503 }))
    const { result } = renderHook(() => useThumbnail('cam1'))
    await flush()
    expect(result.current).toMatchObject({ src: null, stale: true, cloudUnavailable: true })
    fetchMock.mockImplementation(async () => frame(null, 503))
    await advance(10_000)
    expect(result.current.cloudUnavailable).toBe(false)
    fetchMock.mockImplementation(async () => frame('3'))
    await advance(10_000)
    expect(result.current).toMatchObject({ stale: false, cloudUnavailable: false })
  })

  it('is stale when the age header is missing', async () => {
    fetchMock.mockImplementation(async () => frame(null))
    const { result } = renderHook(() => useThumbnail('cam1'))
    await flush()
    expect(result.current.stale).toBe(true)
  })

  it('ends the session on 401', async () => {
    const ended = vi.fn()
    const off = onSessionEnded(ended)
    fetchMock.mockImplementation(async () => frame(null, 401))
    const { result } = renderHook(() => useThumbnail('cam1'))
    await flush()
    off()
    expect(ended).toHaveBeenCalledTimes(1)
    expect(result.current.stale).toBe(true)
  })
})

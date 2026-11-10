import { mseSocketUrl, thumbnailPath, webrtcPath } from './cameraPaths'
import { cameraFetch, CameraRequestError } from './cameraRequest'
import { mseCodecs, parseMseMessage } from './mseProtocol'
import { closeEvent, failureOf } from './streamFailure'
import { formatFrameAge, isThumbnailStale, parseFrameAge } from './thumbnailAge'

describe('camera paths', () => {
  it('encodes the id and follows the page protocol for the socket', () => {
    expect(thumbnailPath('a/b')).toBe('/api/cameras/a%2Fb/thumbnail.jpg')
    expect(webrtcPath('c1')).toBe('/api/cameras/c1/webrtc')
    expect(mseSocketUrl('c1', { protocol: 'https:', host: 'home:4000' })).toBe('wss://home:4000/api/cameras/c1/mse')
    expect(mseSocketUrl('c1', { protocol: 'http:', host: 'home' })).toBe('ws://home/api/cameras/c1/mse')
  })
})

describe('thumbnail age', () => {
  it('parses X-Frame-Age, treating missing or bad values as infinitely old', () => {
    expect(parseFrameAge('12')).toBe(12)
    for (const bad of [null, '', 'abc', '-1']) expect(parseFrameAge(bad)).toBe(Number.POSITIVE_INFINITY)
  })

  it('is stale over 60 s or after a failure', () => {
    expect(isThumbnailStale(60, false)).toBe(false)
    expect(isThumbnailStale(61, false)).toBe(true)
    expect(isThumbnailStale(null, false)).toBe(false)
    expect(isThumbnailStale(5, true)).toBe(true)
  })

  it('formats as "12 s ago"', () => {
    expect(formatFrameAge(12)).toBe('12 s ago')
    expect(formatFrameAge(3.6)).toBe('4 s ago')
  })
})

describe('mse protocol', () => {
  it("lists the supported codecs in go2rtc's order", () => {
    expect(mseCodecs((t) => t.includes('avc1.64') || t.includes('opus'))).toBe('avc1.640029,avc1.64002A,avc1.640033,opus')
    expect(mseCodecs(() => false)).toBe('')
  })

  it('parses mse and error replies only', () => {
    expect(parseMseMessage('{"type":"mse","value":"video/mp4"}')).toEqual({ type: 'mse', value: 'video/mp4' })
    expect(parseMseMessage('{"type":"error","value":"x"}')).toEqual({ type: 'error', value: 'x' })
    expect(parseMseMessage('{"type":"other","value":"x"}')).toBeNull()
    expect(parseMseMessage('not json')).toBeNull()
    expect(parseMseMessage('null')).toBeNull()
  })
})

describe('stream failures', () => {
  it('maps signalling errors', () => {
    expect(failureOf(new CameraRequestError(401))).toBe('session')
    expect(failureOf(new CameraRequestError(404))).toBe('unavailable')
    expect(failureOf(new CameraRequestError(503))).toBe('fallback')
    expect(failureOf(new CameraRequestError(400))).toBe('fallback')
    expect(failureOf(new TypeError('Failed to fetch'))).toBe('fallback')
  })

  it('maps socket close codes', () => {
    expect(closeEvent(4401, true)).toEqual({ type: 'failed', failure: 'session' })
    expect(closeEvent(4404, true)).toEqual({ type: 'failed', failure: 'unavailable' })
    expect(closeEvent(4503, false)).toEqual({ type: 'failed', failure: 'unavailable' })
    expect(closeEvent(1000, true)).toEqual({ type: 'dropped' })
    expect(closeEvent(1009, false)).toEqual({ type: 'failed', failure: 'fallback' })
  })

  it("maps the cloud's refusal: a 503 with its code, or (for cloud cameras) a 4503 close", () => {
    expect(failureOf(new CameraRequestError(503, 'CLOUD_STREAM_UNAVAILABLE'))).toBe('cloud')
    expect(failureOf(new CameraRequestError(503, 'CAMERA_UNAVAILABLE'))).toBe('fallback')
    expect(failureOf(new CameraRequestError(404, 'CLOUD_STREAM_UNAVAILABLE'))).toBe('unavailable')
    expect(closeEvent(4503, false, true)).toEqual({ type: 'failed', failure: 'cloud' })
    expect(closeEvent(4503, true, true)).toEqual({ type: 'failed', failure: 'cloud' })
    expect(closeEvent(4404, false, true)).toEqual({ type: 'failed', failure: 'unavailable' })
    expect(closeEvent(4503, false, false)).toEqual({ type: 'failed', failure: 'unavailable' })
  })

  it('reads the code from a failed camera request', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 'CLOUD_STREAM_UNAVAILABLE' }), { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const err = await cameraFetch('/api/cameras/c1/webrtc').catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 503, code: 'CLOUD_STREAM_UNAVAILABLE' })
    fetchMock.mockResolvedValue(new Response('not json', { status: 503 }))
    expect(await cameraFetch('/x').catch((e: unknown) => e)).toMatchObject({ status: 503, code: undefined })
    vi.unstubAllGlobals()
  })
})

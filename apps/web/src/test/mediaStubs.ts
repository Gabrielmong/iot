import { vi } from 'vitest'

/**
 * Minimal stand-ins for the browser media APIs jsdom lacks (RTCPeerConnection, MediaStream,
 * MediaSource, URL.createObjectURL), plus a WebSocket the test drives by hand.
 */

type Listener = (e: Event) => void

class Emitter {
  private readonly listeners = new Map<string, Set<Listener>>()
  addEventListener(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn)
  }
  protected emit(type: string) {
    this.listeners.get(type)?.forEach((fn) => fn(new Event(type)))
  }
}

export class FakePeerConnection extends Emitter {
  static instances: FakePeerConnection[] = []
  connectionState: RTCPeerConnectionState = 'new'
  iceGatheringState: RTCIceGatheringState = 'complete'
  localDescription: RTCSessionDescriptionInit | null = null
  remoteDescription: RTCSessionDescriptionInit | null = null
  transceivers: { kind: string; direction?: string }[] = []
  closed = false

  constructor() {
    super()
    FakePeerConnection.instances.push(this)
  }
  addTransceiver(kind: string, init?: RTCRtpTransceiverInit) {
    this.transceivers.push({ kind, direction: init?.direction })
    return { receiver: { track: { kind } } }
  }
  async createOffer() {
    return { type: 'offer' as const, sdp: 'v=0 offer' }
  }
  async setLocalDescription(d: RTCSessionDescriptionInit) {
    this.localDescription = d
  }
  async setRemoteDescription(d: RTCSessionDescriptionInit) {
    if (this.closed) throw new Error('closed')
    this.remoteDescription = d
  }
  /** Test hook: the browser reports a new connection state. */
  setConnectionState(state: RTCPeerConnectionState) {
    this.connectionState = state
    this.emit('connectionstatechange')
  }
  close() {
    this.closed = true
    this.connectionState = 'closed'
  }
}

export class FakeMediaStream {
  readonly tracks: unknown[]
  constructor(tracks: unknown[]) {
    this.tracks = tracks
  }
}

export class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  binaryType = 'blob'
  sent: unknown[] = []
  closed = false
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null

  readonly url: string
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  send(data: unknown) {
    this.sent.push(data)
  }
  close() {
    this.closed = true
  }
  /** Test hooks: the server side. */
  open() {
    this.onopen?.(new Event('open'))
  }
  receive(data: unknown) {
    this.onmessage?.({ data })
  }
  serverClose(code: number) {
    this.onclose?.({ code })
  }
}

export class FakeSourceBuffer extends Emitter {
  updating = false
  mode = 'segments'
  appended: unknown[] = []
  buffered = { length: 0, start: () => 0, end: () => 0 }
  readonly mime: string
  constructor(mime: string) {
    super()
    this.mime = mime
  }
  appendBuffer(data: unknown) {
    this.appended.push(data)
  }
  remove() {}
}

export class FakeMediaSource extends Emitter {
  static instances: FakeMediaSource[] = []
  static isTypeSupported = (type: string) => type.includes('avc1.640029') || type.includes('mp4a.40.2')
  readyState = 'closed'
  buffers: FakeSourceBuffer[] = []

  constructor() {
    super()
    FakeMediaSource.instances.push(this)
    queueMicrotask(() => {
      this.readyState = 'open'
      this.emit('sourceopen')
    })
  }
  addSourceBuffer(mime: string) {
    const sb = new FakeSourceBuffer(mime)
    this.buffers.push(sb)
    return sb
  }
  endOfStream() {
    this.readyState = 'ended'
  }
}

/** Fake object URLs: `created` and `revoked` record every call. */
export function stubObjectUrls() {
  let n = 0
  const urls = { created: [] as string[], revoked: [] as string[] }
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:test/${++n}`
    urls.created.push(url)
    return url
  })
  URL.revokeObjectURL = vi.fn((url: string) => {
    urls.revoked.push(url)
  })
  return urls
}

/** Installs every media fake as a global (undo with `vi.unstubAllGlobals()`). */
export function installMediaStubs() {
  FakePeerConnection.instances = []
  FakeWebSocket.instances = []
  FakeMediaSource.instances = []
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
  vi.stubGlobal('MediaStream', FakeMediaStream)
  vi.stubGlobal('MediaSource', FakeMediaSource)
  vi.stubGlobal('WebSocket', FakeWebSocket)
  return stubObjectUrls()
}

/** Sets `document.visibilityState` / `document.hidden` and fires `visibilitychange`. */
export function setDocumentVisible(visible: boolean) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => !visible })
  document.dispatchEvent(new Event('visibilitychange'))
}

/** Removes the overrides `setDocumentVisible` installed. */
export function resetDocumentVisibility() {
  delete (document as { visibilityState?: unknown }).visibilityState
  delete (document as { hidden?: unknown }).hidden
}

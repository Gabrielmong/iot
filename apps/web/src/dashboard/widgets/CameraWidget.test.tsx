import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { deviceFixture } from '../../test/deviceFixtures'
import { CameraWidget } from './CameraWidget'
import { LiveSlotsProvider } from './live/LiveSlotsProvider'

vi.mock('../../device/camera/useLiveStream', () => ({
  useLiveStream: () => ({ transport: 'webrtc', phase: 'playing', attempt: 0 }),
}))

class VisibleObserver {
  private readonly callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe(el: Element) {
    this.callback([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
  unobserve() {}
  disconnect() {}
}

const cams = ['Door', 'Yard', 'Garage'].map((name) => deviceFixture({ id: name.toLowerCase(), name, kind: 'CAMERA' }))

const renderCams = (list = cams) =>
  render(
    <MemoryRouter>
      <LiveSlotsProvider>
        {list.map((device) => (
          <CameraWidget key={device.id} device={device} />
        ))}
      </LiveSlotsProvider>
    </MemoryRouter>,
  )

const videos = () => document.querySelectorAll('video')

beforeEach(() => vi.stubGlobal('IntersectionObserver', VisibleObserver))
afterEach(() => vi.unstubAllGlobals())

describe('CameraWidget', () => {
  it('plays at most two cameras; the third offers Play', () => {
    renderCams()
    expect(videos()).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Play Garage' })).toBeInTheDocument()
  })

  it('Play starts that camera and stops the oldest', () => {
    renderCams()
    fireEvent.click(screen.getByRole('button', { name: 'Play Garage' }))
    expect(videos()).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Play Door' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play Garage' })).not.toBeInTheDocument()
  })

  it('frees the slots of cameras that go away', () => {
    const view = renderCams()
    view.rerender(
      <MemoryRouter>
        <LiveSlotsProvider>
          <CameraWidget key="garage" device={cams[2]} />
        </LiveSlotsProvider>
      </MemoryRouter>,
    )
    expect(videos()).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^Play/ })).not.toBeInTheDocument()
  })
})

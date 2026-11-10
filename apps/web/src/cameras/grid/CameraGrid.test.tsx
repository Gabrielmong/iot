import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import type { PlayerPhase } from '../../device/lib/playerMachine'
import { deviceFixture } from '../../test/deviceFixtures'
import type { Layout } from '../lib/gridLayout'
import { CameraGrid } from './CameraGrid'

const streams: { deviceId: string; quality: string }[] = []
const phases = new Map<string, PlayerPhase>()

vi.mock('../../device/camera/useLiveStream', () => ({
  useLiveStream: (deviceId: string, _ref: unknown, _cloud: boolean, quality = 'main') => {
    streams.push({ deviceId, quality })
    return { transport: 'webrtc', phase: phases.get(deviceId) ?? 'playing', attempt: 0 }
  },
}))

const cams = Array.from({ length: 6 }, (_, i) => deviceFixture({ id: `c${i + 1}`, name: `Cam ${i + 1}`, kind: 'CAMERA', brand: 'SWANN' }))

function Harness({ initial = 4 as Layout, cameras = cams }) {
  const [layout, setLayout] = useState<Layout>(initial)
  return <CameraGrid cameras={cameras} layout={layout} onLayout={setLayout} />
}

const tiles = () => screen.queryAllByRole('button', { name: /^Open Cam/ })
const emptySlots = () => screen.queryAllByTestId('empty-slot')

beforeEach(() => {
  streams.length = 0
  phases.clear()
})

describe('CameraGrid', () => {
  it('pages cameras that do not fit the layout', () => {
    render(<Harness />)
    expect(tiles()).toHaveLength(4)
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(tiles().map((t) => t.getAttribute('aria-label'))).toEqual(['Open Cam 5', 'Open Cam 6'])
    expect(emptySlots()).toHaveLength(2)
  })

  it('changes how many cameras show at once', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '8 cameras' }))
    expect(tiles()).toHaveLength(6)
    expect(emptySlots()).toHaveLength(2)
    expect(screen.queryByText(/^Page/)).not.toBeInTheDocument()
  })

  it('streams the light sub-stream in tiles', () => {
    render(<Harness />)
    expect(new Set(streams.map((s) => s.quality))).toEqual(new Set(['sub']))
  })

  it('opens one camera full view and stops the grid meanwhile', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Cam 2' }))
    const dialog = screen.getByRole('dialog', { name: 'Cam 2' })
    expect(tiles()).toHaveLength(0)
    expect(streams.at(-1)).toEqual({ deviceId: 'c2', quality: 'main' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(tiles()).toHaveLength(4)
  })

  it('keeps retrying a tile that gave up', () => {
    vi.useFakeTimers()
    try {
      phases.set('c1', 'unavailable')
      render(<Harness initial={1} />)
      expect(screen.getByText('Unavailable')).toBeInTheDocument()
      const before = streams.filter((s) => s.deviceId === 'c1').length
      act(() => vi.advanceTimersByTime(2000))
      expect(streams.filter((s) => s.deviceId === 'c1').length).toBeGreaterThan(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clamps the page when cameras are removed', () => {
    const { rerender } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    rerender(<Harness cameras={cams.slice(0, 3)} />)
    expect(tiles()).toHaveLength(3)
  })

  it('opens the full view inside the grid while the grid is in browser full screen', () => {
    render(<Harness />)
    const frame = screen.getByTestId('camera-grid')
    Object.defineProperty(document, 'fullscreenElement', { value: frame, configurable: true })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Open Cam 2' }))
      expect(frame).toContainElement(screen.getByRole('dialog', { name: 'Cam 2' }))
    } finally {
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    }
  })

  it('shows a message instead of empty slots when there are no cameras', () => {
    render(<CameraGrid cameras={[]} layout={16} onLayout={() => {}} empty="No cameras you can see" />)
    expect(screen.getByText('No cameras you can see')).toBeInTheDocument()
    expect(emptySlots()).toHaveLength(0)
  })
})

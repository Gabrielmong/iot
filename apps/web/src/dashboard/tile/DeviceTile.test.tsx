import { act, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { theme } from '../../theme'
import { deviceFixture, lightFixture } from '../../test/deviceFixtures'
import type { DeviceFieldsFragment } from '../../gql/graphql'
import { stubObjectUrls } from '../../test/mediaStubs'
import { DeviceTile } from './DeviceTile'

function renderTile(device: DeviceFieldsFragment, isAdmin = false) {
  const onToggle = vi.fn()
  const onOpenDetails = vi.fn()
  render(
    <MemoryRouter>
      <DeviceTile device={device} isAdmin={isAdmin} onToggle={onToggle} onOpenDetails={onOpenDetails} />
    </MemoryRouter>,
  )
  return { onToggle, onOpenDetails }
}

describe('DeviceTile', () => {
  afterEach(() => vi.unstubAllGlobals())

  describe('TVs and computers', () => {
    afterEach(() => vi.useRealTimers())
    const sala = (o = {}) => deviceFixture({ name: 'Sala TV', kind: 'TV', brand: 'ANDROID_TV', ...o })
    const pc = (o = {}) => deviceFixture({ name: 'Office PC', kind: 'COMPUTER', brand: 'WOL', ...o })

    it('a TV toggles on tap and shows On / Off', () => {
      const device = sala({ on: true })
      const { onToggle } = renderTile(device)
      const tile = screen.getByRole('button', { name: 'Sala TV' })
      expect(tile).toHaveTextContent('On')
      expect(screen.getByTestId('power-indicator')).toHaveAttribute('data-state', 'on')
      expect(screen.getByTestId('tile-toggle')).toHaveAttribute('data-state', 'on')
      fireEvent.click(tile)
      expect(onToggle).toHaveBeenCalledWith(device)
    })

    it('a TV that needs pairing shows the setup link to an admin and is inert for others', () => {
      const { onToggle } = renderTile(sala({ status: 'NEEDS_PAIRING' }), true)
      expect(screen.getByRole('button', { name: 'Sala TV' })).toHaveTextContent('Needs setup')
      expect(screen.getByRole('link', { name: /set up/i })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Sala TV' }))
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('a TV that needs pairing has no setup link for a regular user', () => {
      renderTile(sala({ status: 'NEEDS_PAIRING' }))
      expect(screen.getByRole('button', { name: 'Sala TV' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.queryByRole('link', { name: /set up/i })).not.toBeInTheDocument()
    })

    it('a computer tile wakes on tap and shows Waking… for 5 s', () => {
      vi.useFakeTimers()
      const device = pc({ on: false })
      const { onToggle } = renderTile(device)
      const tile = screen.getByRole('button', { name: 'Office PC' })
      expect(tile).toHaveTextContent('Off')
      expect(tile).toHaveTextContent('Wake')
      expect(screen.queryByTestId('power-indicator')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tile-toggle')).not.toBeInTheDocument()
      fireEvent.click(tile)
      expect(onToggle).toHaveBeenCalledWith(device)
      expect(tile).toHaveTextContent('Waking…')
      act(() => vi.advanceTimersByTime(5000))
      expect(tile).not.toHaveTextContent('Waking…')
    })

    it('an awake computer has the on look but no power controls or Wake action', () => {
      renderTile(pc({ id: 'a', on: true }))
      const tile = screen.getByRole('button', { name: 'Office PC' })
      expect(tile).toHaveTextContent('On')
      expect(tile).not.toHaveTextContent('Wake')
      expect(screen.queryByTestId('power-indicator')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tile-toggle')).not.toBeInTheDocument()
    })

    it('a computer without an IP shows no status', () => {
      renderTile(pc({ on: null }))
      const tile = screen.getByRole('button', { name: 'Office PC' })
      expect(screen.queryByTestId('power-indicator')).not.toBeInTheDocument()
      expect(tile).not.toHaveTextContent(/Online|Offline|\bOn\b|\bOff\b/)
    })
  })

  it('shows name, room and the "Purple · 70%" state line', () => {
    renderTile(lightFixture({ color: { r: 155, g: 89, b: 255 }, brightness: 70 }))
    const tile = screen.getByRole('button', { name: 'Desk lamp' })
    expect(tile).toHaveTextContent('Living room')
    expect(tile).toHaveTextContent('Purple · 70%')
    expect(tile).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports aria-pressed from light.on for lights', () => {
    renderTile(lightFixture({ on: false }))
    expect(screen.getByRole('button', { name: 'Desk lamp' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggles on tap', () => {
    const device = lightFixture()
    const { onToggle } = renderTile(device)
    fireEvent.click(screen.getByRole('button', { name: 'Desk lamp' }))
    expect(onToggle).toHaveBeenCalledWith(device)
  })

  it('is aria-disabled and not toggleable when offline', () => {
    const { onToggle } = renderTile(lightFixture({}, { online: false }))
    const tile = screen.getByRole('button', { name: 'Desk lamp' })
    expect(tile).toHaveAttribute('aria-disabled', 'true')
    expect(tile).toHaveTextContent('Offline')
    fireEvent.click(tile)
    expect(onToggle).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'More controls for Desk lamp' })).not.toBeInTheDocument()
  })

  it('opens the details page from the ⋯ button', () => {
    const device = lightFixture()
    const { onOpenDetails, onToggle } = renderTile(device)
    fireEvent.click(screen.getByRole('button', { name: 'More controls for Desk lamp' }))
    expect(onOpenDetails).toHaveBeenCalledWith(device)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('opens the details page on a 500 ms touch long-press instead of toggling', () => {
    vi.useFakeTimers()
    const device = lightFixture()
    const { onOpenDetails, onToggle } = renderTile(device)
    const tile = screen.getByRole('button', { name: 'Desk lamp' })
    fireEvent.pointerDown(tile, { pointerType: 'touch' })
    vi.advanceTimersByTime(500)
    fireEvent.pointerUp(tile, { pointerType: 'touch' })
    fireEvent.click(tile)
    vi.useRealTimers()
    expect(onOpenDetails).toHaveBeenCalledWith(device)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('shows Needs setup with a Devices link for admins only', () => {
    renderTile(deviceFixture({ status: 'KEY_INVALID' }), true)
    expect(screen.getByRole('button', { name: 'Desk lamp' })).toHaveTextContent('Needs setup')
    expect(screen.getByRole('link', { name: 'Set up in Devices' })).toHaveAttribute('href', '/admin/devices')
  })

  it('shows Needs setup without a link for users', () => {
    renderTile(deviceFixture({ status: 'NEEDS_KEY' }))
    expect(screen.getByRole('button', { name: 'Desk lamp' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('opens the details page when a camera is tapped (nothing to toggle)', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    const device = deviceFixture({ kind: 'CAMERA', name: 'Door cam' })
    const { onOpenDetails, onToggle } = renderTile(device)
    const tile = screen.getByRole('button', { name: 'Door cam' })
    expect(tile).not.toHaveTextContent('Not supported yet')
    expect(tile).not.toHaveAttribute('aria-disabled', 'true')
    expect(tile).not.toHaveAttribute('aria-pressed')
    expect(screen.queryByRole('button', { name: /More controls/ })).not.toBeInTheDocument()
    fireEvent.click(tile)
    expect(onOpenDetails).toHaveBeenCalledWith(device)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it("shows a camera's thumbnail with its age", async () => {
    stubObjectUrls()
    const fetchMock = vi.fn(async () => new Response('jpeg', { headers: { 'X-Frame-Age': '12' } }))
    vi.stubGlobal('fetch', fetchMock)
    renderTile(deviceFixture({ id: 'cam1', kind: 'CAMERA', name: 'Door cam' }))
    expect(await screen.findByRole('img', { name: 'Latest camera image' })).toHaveAttribute(
      'src',
      'blob:test/1',
    )
    expect(screen.getByText('12 s ago')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/cameras/cam1/thumbnail.jpg', expect.anything())
  })

  it('shows Needs setup, not a thumbnail, for a camera that needs setup', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderTile(deviceFixture({ kind: 'CAMERA', name: 'Door cam', status: 'NEEDS_CREDENTIALS' }))
    expect(screen.getByRole('button', { name: 'Door cam' })).toHaveTextContent('Needs setup')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves unknown kinds inert', () => {
    const { onOpenDetails, onToggle } = renderTile(deviceFixture({ kind: 'UNKNOWN', name: 'Mystery' }))
    const tile = screen.getByRole('button', { name: 'Mystery' })
    expect(tile).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(tile)
    expect(onOpenDetails).not.toHaveBeenCalled()
    expect(onToggle).not.toHaveBeenCalled()
  })

  describe('switch and plug on/off look', () => {
    const green = 'rgb(47, 211, 138)' // #2fd38a

    function renderThemed(device: DeviceFieldsFragment) {
      const onToggle = vi.fn()
      const { container } = render(
        <ThemeProvider theme={theme}>
          <MemoryRouter>
            <DeviceTile device={device} isAdmin={false} onToggle={onToggle} onOpenDetails={vi.fn()} />
          </MemoryRouter>
        </ThemeProvider>,
      )
      const border = () => getComputedStyle(container.firstElementChild as Element).borderColor
      return { onToggle, border }
    }

    it('shows green indicator, toggle and border for an on plug', () => {
      const { border } = renderThemed(deviceFixture({ kind: 'PLUG', on: true }))
      expect(screen.getByTestId('power-indicator')).toHaveAttribute('data-state', 'on')
      expect(screen.getByTestId('tile-toggle')).toHaveAttribute('data-state', 'on')
      expect(border()).toBe(green)
    })

    it('shows the off look for an off switch', () => {
      const { border } = renderThemed(deviceFixture({ kind: 'SWITCH', on: false }))
      expect(screen.getByTestId('power-indicator')).toHaveAttribute('data-state', 'off')
      expect(screen.getByTestId('tile-toggle')).toHaveAttribute('data-state', 'off')
      expect(border()).not.toBe(green)
    })

    it('is not green when an on plug is offline', () => {
      const { border } = renderThemed(deviceFixture({ kind: 'PLUG', on: true, online: false }))
      expect(screen.getByTestId('power-indicator')).toHaveAttribute('data-state', 'off')
      expect(screen.getByTestId('tile-toggle')).toHaveAttribute('data-state', 'off')
      expect(border()).not.toBe(green)
    })

    it('does not show the indicator on light tiles', () => {
      renderThemed(lightFixture())
      expect(screen.queryByTestId('power-indicator')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tile-toggle')).not.toBeInTheDocument()
    })

    it('still toggles exactly once per tap', () => {
      const { onToggle } = renderThemed(deviceFixture({ kind: 'PLUG', on: true }))
      fireEvent.click(screen.getByRole('button', { name: 'Desk lamp' }))
      expect(onToggle).toHaveBeenCalledTimes(1)
    })
  })
})

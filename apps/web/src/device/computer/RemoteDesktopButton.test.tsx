import { act, fireEvent, render, screen } from '@testing-library/react'
import { computerFixture, deviceFixture } from '../../test/deviceFixtures'
import type { WakeStatus } from '../../gql/graphql'
import type { DeviceDetail } from '../types'
import { RemoteDesktopButton } from './RemoteDesktopButton'
import { openRemoteDesktop } from './rdp/openRemoteDesktop'
import { useRemoteDesktopLaunch } from './rdp/useRemoteDesktopLaunch'

vi.mock('./rdp/openRemoteDesktop', () => ({ openRemoteDesktop: vi.fn() }))
vi.mock('./rdp/useRemoteDesktopLaunch', () => ({ useRemoteDesktopLaunch: vi.fn(() => false) }))

const pc = (on: boolean, rdpAddress: string | null, status: WakeStatus | null = null) =>
  ({
    ...deviceFixture({ id: 'pc1', name: 'Office PC', kind: 'COMPUTER', brand: 'WOL', on, computer: computerFixture({ rdpAddress, wake: status && { status, seconds: status === 'WOKE' ? 20 : null } }) }),
    lastSeenAt: null,
    streamSource: null,
    ip: null,
  }) as DeviceDetail


describe('RemoteDesktopButton', () => {
  beforeEach(() => vi.mocked(openRemoteDesktop).mockClear())

  it('is hidden until Remote Desktop has answered', () => {
    render(<RemoteDesktopButton device={pc(true, null)} onWake={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /remote desktop/i })).toBeNull()
  })

  it('opens at once when the PC is on', () => {
    const onWake = vi.fn()
    render(<RemoteDesktopButton device={pc(true, '192.168.0.50')} onWake={onWake} />)
    fireEvent.click(screen.getByRole('button', { name: /remote desktop/i }))
    expect(openRemoteDesktop).toHaveBeenCalledWith('192.168.0.50', 'Office PC', false)
    expect(onWake).not.toHaveBeenCalled()
  })

  it("launches Remote Desktop directly when this browser's PC has the HomeAgent", () => {
    vi.mocked(useRemoteDesktopLaunch).mockReturnValueOnce(true)
    render(<RemoteDesktopButton device={pc(true, '192.168.0.50')} onWake={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /remote desktop/i }))
    expect(openRemoteDesktop).toHaveBeenCalledWith('192.168.0.50', 'Office PC', true)
  })

  it('wakes an off PC and opens once the server says it woke', () => {
    const onWake = vi.fn()
    const { rerender } = render(<RemoteDesktopButton device={pc(false, '192.168.0.50')} onWake={onWake} />)
    fireEvent.click(screen.getByRole('button', { name: /remote desktop/i }))
    expect(onWake).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /waking/i })).toBeDisabled()
    rerender(<RemoteDesktopButton device={pc(false, '192.168.0.50', 'WAKING')} onWake={onWake} />)
    expect(openRemoteDesktop).not.toHaveBeenCalled()
    rerender(<RemoteDesktopButton device={pc(true, '192.168.0.50', 'WOKE')} onWake={onWake} />)
    expect(openRemoteDesktop).toHaveBeenCalledWith('192.168.0.50', 'Office PC', false)
    expect(screen.getByRole('button', { name: /remote desktop/i })).toBeEnabled()
  })

  it("gives up quietly when the PC didn't wake, and ignores a result left from an earlier wake", () => {
    const onWake = vi.fn()
    const { rerender } = render(<RemoteDesktopButton device={pc(false, '192.168.0.50', 'FAILED')} onWake={onWake} />)
    fireEvent.click(screen.getByRole('button', { name: /remote desktop/i }))
    expect(screen.getByRole('button', { name: /waking/i })).toBeDisabled()
    rerender(<RemoteDesktopButton device={pc(false, '192.168.0.50', 'WAKING')} onWake={onWake} />)
    rerender(<RemoteDesktopButton device={pc(false, '192.168.0.50', 'FAILED')} onWake={onWake} />)
    expect(openRemoteDesktop).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /remote desktop/i })).toBeEnabled()
  })

  it('gives up when the wake command fails', async () => {
    render(<RemoteDesktopButton device={pc(false, '192.168.0.50')} onWake={() => Promise.resolve(false)} />)
    fireEvent.click(screen.getByRole('button', { name: /remote desktop/i }))
    expect(await screen.findByRole('button', { name: /remote desktop/i })).toBeEnabled()
    expect(openRemoteDesktop).not.toHaveBeenCalled()
  })

  it('gives up if no result arrives in time', () => {
    vi.useFakeTimers()
    try {
      render(<RemoteDesktopButton device={pc(false, '192.168.0.50')} onWake={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /remote desktop/i }))
      expect(screen.getByRole('button', { name: /waking/i })).toBeDisabled()
      act(() => vi.advanceTimersByTime(150_000))
      expect(screen.getByRole('button', { name: /remote desktop/i })).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })
})

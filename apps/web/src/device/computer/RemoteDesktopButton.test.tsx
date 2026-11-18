import { act, fireEvent, render, screen } from '@testing-library/react'
import { computerFixture, deviceFixture } from '../../test/deviceFixtures'
import type { WakeStatus } from '../../gql/graphql'
import type { DeviceDetail } from '../types'
import { RemoteDesktopButton } from './RemoteDesktopButton'
import { openUrl } from './openUrl'

vi.mock('./openUrl', () => ({ openUrl: vi.fn() }))

const pc = (on: boolean, rdpAddress: string | null, status: WakeStatus | null = null) =>
  ({
    ...deviceFixture({ id: 'pc1', name: 'Office PC', kind: 'COMPUTER', brand: 'WOL', on, computer: computerFixture({ rdpAddress, wake: status && { status, seconds: status === 'WOKE' ? 20 : null } }) }),
    lastSeenAt: null,
    streamSource: null,
    ip: null,
  }) as DeviceDetail

const LINK = 'rdp://full%20address=s:192.168.0.50'

describe('RemoteDesktopButton', () => {
  beforeEach(() => vi.mocked(openUrl).mockClear())

  it('is hidden until Remote Desktop has answered', () => {
    render(<RemoteDesktopButton device={pc(true, null)} onWake={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /remote desktop/i })).toBeNull()
  })

  it('opens at once when the PC is on', () => {
    const onWake = vi.fn()
    render(<RemoteDesktopButton device={pc(true, '192.168.0.50')} onWake={onWake} />)
    fireEvent.click(screen.getByRole('button', { name: /remote desktop/i }))
    expect(openUrl).toHaveBeenCalledWith(LINK)
    expect(onWake).not.toHaveBeenCalled()
  })

  it('wakes an off PC and opens once the server says it woke', () => {
    const onWake = vi.fn()
    const { rerender } = render(<RemoteDesktopButton device={pc(false, '192.168.0.50')} onWake={onWake} />)
    fireEvent.click(screen.getByRole('button', { name: /remote desktop/i }))
    expect(onWake).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /waking/i })).toBeDisabled()
    rerender(<RemoteDesktopButton device={pc(false, '192.168.0.50', 'WAKING')} onWake={onWake} />)
    expect(openUrl).not.toHaveBeenCalled()
    rerender(<RemoteDesktopButton device={pc(true, '192.168.0.50', 'WOKE')} onWake={onWake} />)
    expect(openUrl).toHaveBeenCalledWith(LINK)
    expect(screen.getByRole('button', { name: /remote desktop/i })).toBeEnabled()
  })

  it("gives up quietly when the PC didn't wake, and ignores a result left from an earlier wake", () => {
    const onWake = vi.fn()
    const { rerender } = render(<RemoteDesktopButton device={pc(false, '192.168.0.50', 'FAILED')} onWake={onWake} />)
    fireEvent.click(screen.getByRole('button', { name: /remote desktop/i }))
    expect(screen.getByRole('button', { name: /waking/i })).toBeDisabled()
    rerender(<RemoteDesktopButton device={pc(false, '192.168.0.50', 'WAKING')} onWake={onWake} />)
    rerender(<RemoteDesktopButton device={pc(false, '192.168.0.50', 'FAILED')} onWake={onWake} />)
    expect(openUrl).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /remote desktop/i })).toBeEnabled()
  })

  it('gives up when the wake command fails', async () => {
    render(<RemoteDesktopButton device={pc(false, '192.168.0.50')} onWake={() => Promise.resolve(false)} />)
    fireEvent.click(screen.getByRole('button', { name: /remote desktop/i }))
    expect(await screen.findByRole('button', { name: /remote desktop/i })).toBeEnabled()
    expect(openUrl).not.toHaveBeenCalled()
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

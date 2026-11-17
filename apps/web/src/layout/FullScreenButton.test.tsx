import { act, fireEvent, render, screen } from '@testing-library/react'
import { FullScreenButton } from './FullScreenButton'

function stubFullScreen(enabled = true) {
  let element: Element | null = null
  const request = vi.fn(async () => {
    element = document.documentElement
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  const exit = vi.fn(async () => {
    element = null
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => enabled })
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit })
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request })
  return { request, exit }
}

describe('FullScreenButton', () => {
  it('enters full screen, then exits on the next tap', async () => {
    const { request, exit } = stubFullScreen()
    render(<FullScreenButton />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Full screen' })))
    expect(request).toHaveBeenCalledOnce()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' })))
    expect(exit).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument()
  })

  it('follows full screen left another way (Esc, back gesture)', async () => {
    stubFullScreen()
    render(<FullScreenButton />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Full screen' })))
    await act(async () => { await document.exitFullscreen() })
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument()
  })

  it('renders nothing where the browser has no full screen', () => {
    stubFullScreen(false)
    render(<FullScreenButton />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

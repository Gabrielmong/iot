import { fireEvent, render, screen } from '@testing-library/react'
import { DeployLogPanel } from './DeployLogPanel'

/** jsdom has no layout: give the log a fixed scroll geometry. */
function geometry(el: HTMLElement, scrollHeight: number, clientHeight = 200) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight })
}

describe('DeployLogPanel', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 1000 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 200 })
  })
  afterEach(() => {
    delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight
    delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
  })

  it('opens at the last line of a finished log', () => {
    render(<DeployLogPanel log={'line\n'.repeat(100)} loading={false} live={false} />)
    expect(screen.getByLabelText('Deploy log').scrollTop).toBe(1000)
  })

  it('follows new lines while pinned to the end', () => {
    const { rerender } = render(<DeployLogPanel log="one" loading={false} live />)
    const log = screen.getByLabelText('Deploy log')
    geometry(log, 1500)
    rerender(<DeployLogPanel log="one\ntwo" loading={false} live />)
    expect(log.scrollTop).toBe(1500)
  })

  it('stops following after the user scrolls up, and Jump to latest pins it again', () => {
    const { rerender } = render(<DeployLogPanel log="one" loading={false} live />)
    const log = screen.getByLabelText('Deploy log')
    log.scrollTop = 100
    fireEvent.scroll(log)
    const jump = screen.getByRole('button', { name: 'Jump to latest' })

    geometry(log, 1500)
    rerender(<DeployLogPanel log="one\ntwo" loading={false} live />)
    expect(log.scrollTop).toBe(100)

    fireEvent.click(jump)
    expect(log.scrollTop).toBe(1500)
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).not.toBeInTheDocument()
  })

  it('says when there is no log', () => {
    render(<DeployLogPanel log={null} loading={false} live={false} />)
    expect(screen.getByLabelText('Deploy log')).toHaveTextContent('No log for this event.')
  })
})

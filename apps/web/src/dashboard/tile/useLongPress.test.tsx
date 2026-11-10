import { fireEvent, render, screen } from '@testing-library/react'
import { useLongPress } from './useLongPress'

function Target({ onLongPress, onClick }: { onLongPress: () => void; onClick: () => void }) {
  const handlers = useLongPress({ onLongPress, onClick })
  return <button {...handlers}>target</button>
}

function setup() {
  const onLongPress = vi.fn()
  const onClick = vi.fn()
  render(<Target onLongPress={onLongPress} onClick={onClick} />)
  return { onLongPress, onClick, el: screen.getByRole('button') }
}

describe('useLongPress', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires onLongPress after 500 ms of touch and swallows the following click', () => {
    const { onLongPress, onClick, el } = setup()
    fireEvent.pointerDown(el, { pointerType: 'touch' })
    vi.advanceTimersByTime(499)
    expect(onLongPress).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(el, { pointerType: 'touch' })
    fireEvent.click(el)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('treats a short touch as a click', () => {
    const { onLongPress, onClick, el } = setup()
    fireEvent.pointerDown(el, { pointerType: 'touch' })
    vi.advanceTimersByTime(200)
    fireEvent.pointerUp(el, { pointerType: 'touch' })
    fireEvent.click(el)
    vi.advanceTimersByTime(1000)
    expect(onLongPress).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('cancels when the finger leaves', () => {
    const { onLongPress, el } = setup()
    fireEvent.pointerDown(el, { pointerType: 'touch' })
    fireEvent.pointerLeave(el, { pointerType: 'touch' })
    vi.advanceTimersByTime(1000)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('does not swallow a later keyboard press after a long-press with no click', () => {
    const { onLongPress, onClick, el } = setup()
    fireEvent.pointerDown(el, { pointerType: 'touch' })
    vi.advanceTimersByTime(500)
    fireEvent.pointerUp(el, { pointerType: 'touch' })
    expect(onLongPress).toHaveBeenCalledTimes(1)
    // the finger slid off: no click followed. Later, a keyboard user presses Enter.
    fireEvent.keyDown(el, { key: 'Enter' })
    fireEvent.click(el)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('blocks the context menu for touch but not for the mouse', () => {
    const { el } = setup()
    fireEvent.pointerDown(el, { pointerType: 'touch' })
    expect(fireEvent.contextMenu(el)).toBe(false)
    fireEvent.pointerUp(el, { pointerType: 'touch' })
    fireEvent.pointerDown(el, { pointerType: 'mouse' })
    expect(fireEvent.contextMenu(el)).toBe(true)
  })

  it('ignores the mouse (desktop uses the ⋯ button)', () => {
    const { onLongPress, el } = setup()
    fireEvent.pointerDown(el, { pointerType: 'mouse' })
    vi.advanceTimersByTime(1000)
    expect(onLongPress).not.toHaveBeenCalled()
  })
})

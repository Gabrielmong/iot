import { act, fireEvent, render, screen } from '@testing-library/react'
import { cameraControlsFixture } from '../../test/cameraControlsFixtures'
import { ControlOverlay, type OverlayActions } from './ControlOverlay'
import { IDLE_MS, LONG_PRESS_MS } from './timing'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(over: Parameters<typeof cameraControlsFixture>[0] = {}) {
  const actions: OverlayActions = { move: vi.fn(), stop: vi.fn(), gotoPreset: vi.fn(), savePreset: vi.fn() }
  const view = render(
    <div data-testid="frame">
      <ControlOverlay controls={cameraControlsFixture(over)} actions={actions} />
    </div>,
  )
  return { actions, ...view }
}

describe('ControlOverlay', () => {
  it('shows the pad only when pan is true, and presets only when presets is non-null', () => {
    setup({ pan: false, presets: null })
    expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull()
    expect(screen.queryByRole('button', { name: /position/ })).toBeNull()
  })

  it('has a labelled button per direction and preset slot', () => {
    setup()
    for (const name of ['Move up', 'Move right', 'Move down', 'Move left', 'Go to position 1', 'Save position 2', 'Save position 3', 'Save position 4']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('holding an arrow moves that way, and releasing stops', () => {
    const { actions } = setup()
    const left = screen.getByRole('button', { name: 'Move left' })
    fireEvent.pointerDown(left)
    expect(actions.move).toHaveBeenCalledWith('LEFT')
    act(() => void vi.advanceTimersByTime(1000))
    fireEvent.pointerUp(left)
    expect(actions.stop).toHaveBeenCalledTimes(1)
  })

  it('tapping a saved slot goes there; tapping an empty one saves it', () => {
    const { actions } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Go to position 1' }))
    expect(actions.gotoPreset).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Save position 3' }))
    expect(actions.savePreset).toHaveBeenCalledWith(3)
  })

  it('long-pressing a saved slot saves over it instead of going', () => {
    const { actions } = setup()
    const slot = screen.getByRole('button', { name: 'Go to position 1' })
    fireEvent.pointerDown(slot)
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS))
    fireEvent.pointerUp(slot)
    fireEvent.click(slot)
    expect(actions.savePreset).toHaveBeenCalledWith(1)
    expect(actions.gotoPreset).not.toHaveBeenCalled()
  })

  it('right-clicking a saved slot saves over it', () => {
    const { actions } = setup()
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Go to position 1' }))
    expect(actions.savePreset).toHaveBeenCalledWith(1)
  })

  it('fades after IDLE_MS without input and comes back on a pointer move over the video', () => {
    setup()
    const overlay = screen.getByTestId('camera-overlay')
    expect(overlay).toHaveAttribute('data-visible', 'true')
    act(() => void vi.advanceTimersByTime(IDLE_MS))
    expect(overlay).toHaveAttribute('data-visible', 'false')
    fireEvent.pointerMove(screen.getByTestId('frame'))
    expect(overlay).toHaveAttribute('data-visible', 'true')
  })
})

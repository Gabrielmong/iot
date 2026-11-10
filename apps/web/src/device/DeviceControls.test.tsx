import { fireEvent, render, screen } from '@testing-library/react'
import type { DeviceFieldsFragment } from '../gql/graphql'
import { deviceFixture, lightFixture } from '../test/deviceFixtures'
import { DeviceControls } from './controls/DeviceControls'

function renderControls(device: DeviceFieldsFragment) {
  const onPatch = vi.fn()
  render(<DeviceControls device={device} onPatch={onPatch} />)
  return { onPatch }
}

describe('DeviceControls', () => {
  it('shows every light control for a Govee light', () => {
    renderControls(lightFixture())
    expect(screen.getByRole('switch', { name: 'Power' })).toBeChecked()
    expect(screen.getByRole('slider', { name: 'Brightness' })).toHaveValue('70')
    expect(screen.getAllByRole('button', { name: /^Color / })).toHaveLength(8)
    expect(screen.getByRole('slider', { name: 'Hue' })).toBeInTheDocument()
    const temp = screen.getByRole('slider', { name: 'White temperature' })
    expect(temp).toHaveAttribute('aria-valuemin', '2700')
    expect(temp).toHaveAttribute('aria-valuemax', '6500')
  })

  it('reads power from light.on for lights (state.on is null)', () => {
    renderControls(lightFixture({ on: false }))
    expect(screen.getByRole('switch', { name: 'Power' })).not.toBeChecked()
  })

  it('shows only the power switch for a plug', () => {
    renderControls(deviceFixture({ kind: 'PLUG', name: 'Kettle', on: true }))
    expect(screen.getByRole('switch', { name: 'Power' })).toBeChecked()
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
  })

  it('sends power, color and white temperature changes', () => {
    const { onPatch } = renderControls(lightFixture())
    fireEvent.click(screen.getByRole('switch', { name: 'Power' }))
    expect(onPatch).toHaveBeenLastCalledWith({ on: false })
    fireEvent.click(screen.getByRole('button', { name: 'Color Red' }))
    expect(onPatch).toHaveBeenLastCalledWith({ color: { r: 255, g: 0, b: 0 } })
    fireEvent.keyDown(screen.getByRole('slider', { name: 'White temperature' }), { key: 'Home' })
    expect(onPatch).toHaveBeenLastCalledWith({ colorTempK: 2700 })
  })

  it('sends a hue as a full-saturation color', () => {
    const { onPatch } = renderControls(lightFixture())
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Hue' }), { key: 'Home' })
    expect(onPatch).toHaveBeenLastCalledWith({ color: { r: 255, g: 0, b: 0 } })
  })

  it.each([
    ['offline', lightFixture({}, { online: false }), 'Offline'],
    ['not ready', lightFixture({}, { status: 'KEY_INVALID' }), 'Needs setup'],
  ])('disables every control and sends nothing when %s', (_, device, notice) => {
    const { onPatch } = renderControls(device)
    expect(screen.getByRole('alert')).toHaveTextContent(notice)
    expect(screen.getByRole('switch', { name: 'Power' })).toBeDisabled()
    for (const slider of screen.getAllByRole('slider')) expect(slider).toBeDisabled()
    for (const swatch of screen.getAllByRole('button', { name: /^Color / })) expect(swatch).toBeDisabled()
    fireEvent.click(screen.getByRole('switch', { name: 'Power' }))
    fireEvent.click(screen.getByRole('button', { name: 'Color Red' }))
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Brightness' }), { key: 'ArrowRight' })
    expect(onPatch).not.toHaveBeenCalled()
  })
})

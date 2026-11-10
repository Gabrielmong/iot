import { fireEvent, render, screen, within } from '@testing-library/react'
import { cameraControlsFixture } from '../../test/cameraControlsFixtures'
import { SettingsChips } from './SettingsChips'

function setup(over: Parameters<typeof cameraControlsFixture>[0] = {}) {
  const onChange = vi.fn()
  render(<SettingsChips controls={cameraControlsFixture(over)} onChange={onChange} />)
  return { onChange }
}

describe('SettingsChips', () => {
  it('night vision menu offers Auto / On / Off and marks the current one', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Night vision: Auto' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Auto', 'On', 'Off'])
    expect(within(menu).getByRole('menuitem', { name: 'Auto' })).toHaveClass('Mui-selected')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'On' }))
    expect(onChange).toHaveBeenCalledWith({ nightVision: 'ON' })
  })

  it('only supported settings render', () => {
    setup({ supported: ['flip'] })
    expect(screen.getByRole('button', { name: 'Flip image' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Night vision/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Follow motion' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'More settings' })).toBeNull()
  })

  it('a toggle chip shows its state and flips it', () => {
    const { onChange } = setup()
    const flip = screen.getByRole('button', { name: 'Flip image' })
    expect(flip).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(flip)
    expect(onChange).toHaveBeenCalledWith({ flip: true })
  })

  it('More… lists the supported extras with their current state', () => {
    const { onChange } = setup({ supported: ['flip', 'timestamp', 'statusLight'], settings: { ...cameraControlsFixture().settings!, statusLight: false } })
    fireEvent.click(screen.getByRole('button', { name: 'More settings' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Timestamp on video' })).toHaveAttribute('aria-checked', 'true')
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Status light' })).toHaveAttribute('aria-checked', 'false')
    expect(within(menu).queryByRole('menuitemcheckbox', { name: 'Motion detection' })).toBeNull()
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Status light' }))
    expect(onChange).toHaveBeenCalledWith({ statusLight: true })
  })
})

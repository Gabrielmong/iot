import { fireEvent, render, screen } from '@testing-library/react'
import { AvatarImagePicker } from './AvatarImagePicker'
import { UserAvatar } from './UserAvatar'

describe('UserAvatar', () => {
  it('shows the initial on the user color when there is no picture', () => {
    const { container } = render(<UserAvatar name="ann" color="#43a047" />)
    expect(screen.getByText('A')).toHaveStyle({ backgroundColor: 'rgb(67, 160, 71)' })
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows the chosen picture, ringed in the user color', () => {
    const { container } = render(<UserAvatar name="ann" color="#43a047" image="otter" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toMatch(/otter.*\.webp$/)
    expect(img.parentElement).toHaveStyle({ boxShadow: '0 0 0 2px #43a047' })
  })

  it('falls back to the initial for a picture this build does not know', () => {
    const { container } = render(<UserAvatar name="ann" color="#43a047" image="unicorn" />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})

describe('AvatarImagePicker', () => {
  it('offers the initial plus every picture and reports the choice', () => {
    const onChange = vi.fn()
    render(<AvatarImagePicker name="Ann" color="#43a047" value="" onChange={onChange} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Initial only', 'Bearded dragon', 'Cat', 'Crow', 'Godzilla', 'Otter'])
    expect(screen.getByRole('radio', { name: 'Initial only' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Crow' }))
    expect(onChange).toHaveBeenCalledWith('crow')
  })
})

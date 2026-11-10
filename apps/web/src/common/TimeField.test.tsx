import { act, fireEvent, render, screen } from '@testing-library/react'
import { TimeField } from './TimeField'

describe('TimeField', () => {
  it('is an MUI time picker showing a 24-hour time', () => {
    render(<TimeField label="Time" value="19:30" onChange={() => {}} />)
    expect(screen.getByRole('spinbutton', { name: 'Hours' })).toHaveTextContent('19')
    expect(screen.getByRole('spinbutton', { name: 'Minutes' })).toHaveTextContent('30')
    expect(document.querySelector('input[type="time"]')).toBeNull()
  })

  it('reports HH:MM when an hour changes', () => {
    const onChange = vi.fn()
    render(<TimeField label="Time" value="07:30" onChange={onChange} />)
    const hours = screen.getByRole('spinbutton', { name: 'Hours' })
    act(() => hours.focus())
    fireEvent.keyDown(hours, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith('08:30')
  })
})

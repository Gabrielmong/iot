import { fireEvent, render, screen, within } from '@testing-library/react'
import { KindSelect } from './KindSelect'

const options = async () => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Kind' }))
  return within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
}

describe('KindSelect', () => {
  it('shows a TV as TV, with no other kinds to switch to', async () => {
    render(<KindSelect value="TV" onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Kind' })).toHaveTextContent('TV')
    expect(await options()).toEqual(['TV'])
  })

  it('offers a plug every kind except TV and Computer', async () => {
    render(<KindSelect value="PLUG" onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Kind' })).toHaveTextContent('Plug')
    expect(await options()).toEqual(['Light', 'Switch', 'Plug', 'Camera', 'Unknown'])
  })
})

import { render, screen } from '@testing-library/react'
import { chooseOption } from '../test/chooseOption'
import { SelectField } from './SelectField'

const options = [
  { value: 'USER', label: 'User' },
  { value: 'ADMIN', label: 'Admin' },
]

describe('SelectField', () => {
  it('is an MUI select showing the current label', () => {
    render(<SelectField label="Role" value="USER" options={options} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveTextContent('User')
    expect(document.querySelector('select')).toBeNull()
  })

  it('shows an option whose value is empty', () => {
    render(<SelectField label="Show on" value="" options={[{ value: '', label: 'Whole house' }]} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Show on' })).toHaveTextContent('Whole house')
  })

  it('reports the picked value', async () => {
    const onChange = vi.fn()
    render(<SelectField label="Role" value="USER" options={options} onChange={onChange} />)
    await chooseOption('Role', 'Admin')
    expect(onChange).toHaveBeenCalledWith('ADMIN')
  })
})

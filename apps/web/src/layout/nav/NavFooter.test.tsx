import { fireEvent, render, screen } from '@testing-library/react'
import { MockedProvider } from '@apollo/client/testing/react'
import { NavFooter } from './NavFooter'

const renderFooter = (isGuest: boolean, hasPin: boolean) =>
  render(
    <MockedProvider mocks={[]}>
      <NavFooter isGuest={isGuest} hasPin={hasPin} userName="Sam" userColor="#fff" userImage={null} collapsed={false} onSignOut={() => {}} />
    </MockedProvider>,
  )

describe('NavFooter', () => {
  it('a guest without a PIN has no profile button but can sign out', () => {
    renderFooter(true, false)
    expect(screen.queryByRole('button', { name: /Edit your profile/ })).not.toBeInTheDocument()
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('users and guests with a PIN can open their profile', () => {
    renderFooter(false, true)
    expect(screen.getByRole('button', { name: /Edit your profile/ })).toBeInTheDocument()
  })

  it('a guest with a PIN opens a dialog with only Change PIN', () => {
    renderFooter(true, true)
    fireEvent.click(screen.getByRole('button', { name: /Edit your profile/ }))
    expect(screen.getByLabelText('Current PIN')).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('a user with a PIN gets the full dialog plus Change PIN', () => {
    renderFooter(false, true)
    fireEvent.click(screen.getByRole('button', { name: /Edit your profile/ }))
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Current PIN')).toBeInTheDocument()
  })
})

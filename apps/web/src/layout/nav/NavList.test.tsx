import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { NavList } from './NavList'

const renderNav = (isGuest: boolean) =>
  render(
    <MemoryRouter>
      <NavList isAdmin={false} isGuest={isGuest} collapsed={false} />
    </MemoryRouter>,
  )

describe('NavList', () => {
  it("guests don't see the Cameras link", () => {
    renderNav(true)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Routines' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Cameras' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('users see Cameras', () => {
    renderNav(false)
    expect(screen.getByRole('link', { name: 'Cameras' })).toBeInTheDocument()
  })
})

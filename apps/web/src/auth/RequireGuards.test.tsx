import type { MockLink } from '@apollo/client/testing'
import { MockedProvider } from '@apollo/client/testing/react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ME } from './documents'
import { RequireAdmin } from './RequireAdmin'
import { RequireAuth } from './RequireAuth'
import { RequireNotGuest } from './RequireNotGuest'
import { setToken } from './session'

const me = (role: 'ADMIN' | 'USER' | 'GUEST'): MockLink.MockedResponse => ({
  request: { query: ME },
  result: { data: { me: { __typename: 'User', id: 'u1', name: 'A', avatarColor: '#fff', avatarImage: null, role, hasPin: true } } },
})

function renderAt(path: string, mocks: MockLink.MockedResponse[]) {
  return render(
    <MockedProvider mocks={mocks}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<div>dashboard</div>} />
            <Route element={<RequireNotGuest />}>
              <Route path="/cameras" element={<div>cameras</div>} />
              <Route path="/routines/new" element={<div>editor</div>} />
              <Route path="/routines/:id" element={<div>editor</div>} />
            </Route>
            <Route path="/admin" element={<RequireAdmin />}>
              <Route path="rooms" element={<div>admin rooms</div>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </MockedProvider>,
  )
}

describe('route guards', () => {
  it('sends signed-out visitors to /login', async () => {
    renderAt('/', [])
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('treats an UNAUTHENTICATED me as logged out', async () => {
    setToken('stale')
    renderAt('/', [
      { request: { query: ME }, result: { errors: [{ message: 'x', extensions: { code: 'UNAUTHENTICATED' } }] } },
    ])
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('lets a signed-in user in', async () => {
    setToken('t')
    renderAt('/', [me('USER')])
    expect(await screen.findByText('dashboard')).toBeInTheDocument()
  })

  it('keeps non-admins out of /admin', async () => {
    setToken('t')
    renderAt('/admin/rooms', [me('USER')])
    expect(await screen.findByText('dashboard')).toBeInTheDocument()
  })

  it('lets admins into /admin', async () => {
    setToken('t')
    renderAt('/admin/rooms', [me('ADMIN')])
    expect(await screen.findByText('admin rooms')).toBeInTheDocument()
  })

  it('guests are sent home from cameras and the routine editor', async () => {
    for (const path of ['/cameras', '/routines/new', '/routines/r1']) {
      setToken('t')
      const { unmount } = renderAt(path, [me('GUEST')])
      expect(await screen.findByText('dashboard')).toBeInTheDocument()
      unmount()
    }
  })

  it('lets users into cameras and the routine editor', async () => {
    setToken('t')
    renderAt('/cameras', [me('USER')])
    expect(await screen.findByText('cameras')).toBeInTheDocument()
  })
})

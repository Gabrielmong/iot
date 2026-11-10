import type { MockLink } from '@apollo/client/testing'
import { MockedProvider } from '@apollo/client/testing/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { LOGIN, LOGIN_GUEST, LOGIN_USERS } from './documents'
import { LoginScreen } from './LoginScreen'
import { getToken } from './session'

const alice = { __typename: 'User' as const, id: 'u1', name: 'Alice', avatarColor: '#ff0000', avatarImage: null, role: 'USER' as const, hasPin: true }
const guest = { __typename: 'User' as const, id: 'g1', name: 'Guest', avatarColor: '#00ff00', avatarImage: null, role: 'GUEST' as const, hasPin: false }

const usersMock: MockLink.MockedResponse = {
  request: { query: LOGIN_USERS },
  result: { data: { loginUsers: [alice] } },
}

function loginMock(pin: string, result: MockLink.MockedResponse['result']): MockLink.MockedResponse {
  return {
    request: { query: LOGIN, variables: { userId: 'u1', pin, shared: false } },
    result,
  }
}

async function enterPin(digits: string[]) {
  fireEvent.click(await screen.findByRole('button', { name: 'Alice' }))
  for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d }))
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
}

function renderLogin(mocks: MockLink.MockedResponse[]) {
  return render(
    <MockedProvider mocks={mocks}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/" element={<div>dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </MockedProvider>,
  )
}

describe('LoginScreen', () => {
  it('logs in with the typed PIN, stores the token and leaves /login', async () => {
    renderLogin([
      usersMock,
      loginMock('1234', { data: { login: { __typename: 'AuthPayload', token: 'tok-1', user: alice } } }),
    ])
    await enterPin(['1', '2', '3', '4'])
    expect(await screen.findByText('dashboard')).toBeInTheDocument()
    expect(getToken()).toBe('tok-1')
  })

  it('keeps OK disabled below 4 digits', async () => {
    renderLogin([usersMock])
    fireEvent.click(await screen.findByRole('button', { name: 'Alice' }))
    for (const d of ['1', '2', '3']) fireEvent.click(screen.getByRole('button', { name: d }))
    expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled()
  })

  it('shows the attempts left after a wrong PIN', async () => {
    renderLogin([
      usersMock,
      loginMock('0000', {
        errors: [{ message: 'Incorrect PIN', extensions: { code: 'INVALID_PIN', attemptsLeft: 2 } }],
      }),
    ])
    await enterPin(['0', '0', '0', '0'])
    expect(await screen.findByText('Wrong PIN — 2 tries left')).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('shows the lockout time when locked', async () => {
    renderLogin([
      usersMock,
      loginMock('0000', {
        errors: [{ message: 'Too many attempts', extensions: { code: 'LOCKED', retryAfterSeconds: 45 } }],
      }),
    ])
    await enterPin(['0', '0', '0', '0'])
    expect(await screen.findByText('Locked — try again in 45s')).toBeInTheDocument()
  })

  it('stores the shared-screen choice from the settings toggle', async () => {
    renderLogin([usersMock])
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByLabelText('This is a shared screen'))
    await waitFor(() => expect(localStorage.getItem('home.sharedScreen')).toBe('1'))
  })

  describe('guests', () => {
    const guestsMock = (users: unknown[]): MockLink.MockedResponse => ({
      request: { query: LOGIN_USERS },
      result: { data: { loginUsers: users } },
    })

    it('tapping a PIN-less guest signs straight in', async () => {
      renderLogin([
        guestsMock([alice, guest]),
        {
          request: { query: LOGIN_GUEST, variables: { userId: 'g1', shared: false } },
          result: { data: { loginGuest: { __typename: 'AuthPayload', token: 'tok-g', user: guest } } },
        },
      ])
      fireEvent.click(await screen.findByRole('button', { name: 'Guest' }))
      expect(await screen.findByText('dashboard')).toBeInTheDocument()
      expect(getToken()).toBe('tok-g')
      expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument()
    })

    it('a guest with a PIN gets the PIN pad', async () => {
      renderLogin([guestsMock([{ ...guest, hasPin: true }])])
      fireEvent.click(await screen.findByRole('button', { name: 'Guest' }))
      expect(await screen.findByRole('button', { name: 'OK' })).toBeInTheDocument()
    })

    it('a failed guest sign-in shows the error on the picker', async () => {
      renderLogin([
        guestsMock([guest]),
        {
          request: { query: LOGIN_GUEST, variables: { userId: 'g1', shared: false } },
          result: { errors: [{ message: 'x', extensions: { code: 'SOMETHING' } }] },
        },
      ])
      fireEvent.click(await screen.findByRole('button', { name: 'Guest' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign in')
      expect(screen.getByRole('button', { name: 'Guest' })).toBeInTheDocument()
      expect(getToken()).toBeNull()
    })
  })
})

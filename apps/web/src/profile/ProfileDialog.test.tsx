import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { of } from 'rxjs'
import { createTestClient, reply, type Handler } from '../test/testClient'
import type { ApolloLink } from '@apollo/client/link'
import { profileChanges } from './profileChanges'
import { ProfileDialog } from './ProfileDialog'

const ann = { name: 'Ann', avatarColor: '#43a047', avatarImage: null }

describe('profileChanges', () => {
  it('sends only what changed, trims the name, and clears the picture with an empty string', () => {
    expect(profileChanges(ann, { name: ' Ann ', avatarColor: '#43a047', avatarImage: '' })).toEqual({})
    expect(profileChanges(ann, { name: 'Annie', avatarColor: '#8e24aa', avatarImage: 'otter' })).toEqual({ name: 'Annie', avatarColor: '#8e24aa', avatarImage: 'otter' })
    expect(profileChanges({ ...ann, avatarImage: 'otter' }, { name: 'Ann', avatarColor: '#43a047', avatarImage: '' })).toEqual({ avatarImage: '' })
  })
})

describe('ProfileDialog', () => {
  function renderDialog(onClose = vi.fn()) {
    const sent: Record<string, unknown>[] = []
    const update: Handler = (op) => {
      sent.push(op.variables)
      return reply({ updateProfile: { __typename: 'User', id: 'u1', name: 'Ann', avatarColor: '#43a047', avatarImage: 'crow', role: 'USER' } })(op)
    }
    const client = createTestClient({ UpdateProfile: update, LoginUsers: reply({ loginUsers: [] }) })
    render(
      <ApolloProvider client={client}>
        <ProfileDialog profile={ann} onClose={onClose} />
      </ApolloProvider>,
    )
    return { sent, onClose }
  }

  it('keeps Save disabled until something changes, then saves only the change and closes', async () => {
    const { sent, onClose } = renderDialog()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'Crow' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(sent).toEqual([{ avatarImage: 'crow' }])
  })

  it('does not allow an empty name', () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('ProfileDialog change PIN', () => {
  function renderPin(props: { hasPin?: boolean; pinOnly?: boolean } = {}, change: Handler = reply({ changeMyPin: true })) {
    const sent: Record<string, unknown>[] = []
    const handler: Handler = (op: ApolloLink.Operation) => {
      sent.push(op.variables)
      return change(op)
    }
    const client = createTestClient({ ChangeMyPin: handler, UpdateProfile: reply({}), LoginUsers: reply({ loginUsers: [] }) })
    render(
      <ApolloProvider client={client}>
        <ProfileDialog profile={ann} hasPin={props.hasPin ?? true} pinOnly={props.pinOnly} onClose={vi.fn()} />
      </ApolloProvider>,
    )
    return sent
  }
  const fill = (current: string, next: string, confirm: string) => {
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: current } })
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: next } })
    fireEvent.change(screen.getByLabelText('Confirm new PIN'), { target: { value: confirm } })
  }

  it('changes your PIN', async () => {
    const sent = renderPin()
    fill('1234', '5678', '5678')
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    expect(await screen.findByText('PIN changed')).toBeInTheDocument()
    expect(sent).toEqual([{ currentPin: '1234', newPin: '5678' }])
    expect(screen.getByLabelText('Current PIN')).toHaveValue('')
    expect(screen.getByLabelText('New PIN')).toHaveValue('')
  })

  it('Save stays disabled until the new PINs are valid and match', () => {
    renderPin()
    fill('1234', '567', '567')
    expect(screen.getByRole('button', { name: 'Change PIN' })).toBeDisabled()
    fill('1234', '5678', '5679')
    expect(screen.getByRole('button', { name: 'Change PIN' })).toBeDisabled()
    fill('1234', '5678', '5678')
    expect(screen.getByRole('button', { name: 'Change PIN' })).toBeEnabled()
  })

  it('shows attempts left on a wrong current PIN', async () => {
    renderPin({}, () => of({ errors: [{ message: 'Incorrect PIN', extensions: { code: 'INVALID_PIN', attemptsLeft: 3 } }] }))
    fill('0000', '5678', '5678')
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    expect(await screen.findByText('Wrong PIN — 3 tries left')).toBeInTheDocument()
  })

  it('no Change PIN section without a PIN', () => {
    renderPin({ hasPin: false })
    expect(screen.queryByLabelText('Current PIN')).not.toBeInTheDocument()
  })

  it('pinOnly hides the profile fields', () => {
    renderPin({ pinOnly: true })
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Current PIN')).toBeInTheDocument()
  })

  it('Enter in a PIN field changes the PIN', async () => {
    const sent = renderPin()
    fill('1234', '5678', '5678')
    fireEvent.keyDown(screen.getByLabelText('Confirm new PIN'), { key: 'Enter' })
    expect(await screen.findByText('PIN changed')).toBeInTheDocument()
    expect(sent).toEqual([{ currentPin: '1234', newPin: '5678' }])
  })

  it('Enter in a PIN field never saves the profile or closes the dialog', async () => {
    const updates: unknown[] = []
    const client = createTestClient({
      ChangeMyPin: reply({ changeMyPin: true }),
      UpdateProfile: (op) => {
        updates.push(op.variables)
        return reply({})(op)
      },
      LoginUsers: reply({ loginUsers: [] }),
    })
    const onClose = vi.fn()
    render(
      <ApolloProvider client={client}>
        <ProfileDialog profile={ann} hasPin onClose={onClose} />
      </ApolloProvider>,
    )
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Annie' } })
    fill('1234', '567', '567')
    const input = screen.getByLabelText('New PIN')
    const prevented = !fireEvent.keyDown(input, { key: 'Enter' })
    expect(prevented).toBe(true)
    await new Promise((r) => setTimeout(r, 20))
    expect(updates).toEqual([])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clears a stale error when a field is edited', async () => {
    renderPin({}, () => of({ errors: [{ message: 'x', extensions: { code: 'INVALID_PIN', attemptsLeft: 3 } }] }))
    fill('0000', '5678', '5678')
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    await screen.findByText('Wrong PIN — 3 tries left')
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '0001' } })
    expect(screen.queryByText('Wrong PIN — 3 tries left')).not.toBeInTheDocument()
  })
})

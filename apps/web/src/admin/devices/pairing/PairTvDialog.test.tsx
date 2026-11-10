import { ApolloProvider } from '@apollo/client/react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { NEVER, of } from 'rxjs'
import { adminDeviceFixture } from '../../../test/adminFixtures'
import { createTestClient, type Handler } from '../../../test/testClient'
import { PairTvDialog } from './PairTvDialog'

const tele = adminDeviceFixture({ id: 'tv1', name: 'Tele cuarto', brand: 'ANDROID_TV', kind: 'TV', adopted: true, status: 'NEEDS_PAIRING' })
const paired = { ...tele, status: 'OK' }

type Over = { mode?: 'CODE' | 'ACCEPT_ON_TV'; finish?: Handler }

function setup({ mode = 'CODE', finish }: Over = {}) {
  const calls: Record<string, unknown[]> = { start: [], finish: [], cancel: [] }
  const onClose = vi.fn()
  const client = createTestClient({
    StartTvPairing: (op) => (calls.start!.push(op.variables), of({ data: { startTvPairing: mode } })),
    FinishTvPairing: (op) => {
      calls.finish!.push(op.variables)
      return finish ? finish(op) : of({ data: { finishTvPairing: paired } })
    },
    CancelTvPairing: (op) => (calls.cancel!.push(op.variables), of({ data: { cancelTvPairing: true } })),
    AdminDevices: () => of({ data: { adminDevices: [paired] } }),
  })
  render(
    <ApolloProvider client={client}>
      <PairTvDialog device={tele} onClose={onClose} />
    </ApolloProvider>,
  )
  return { calls, onClose }
}

const dialog = () => screen.findByRole('dialog', { name: 'Pair Tele cuarto' })

describe('PairTvDialog', () => {
  it('asks for the code the TV shows and pairs with it', async () => {
    const { calls } = setup()
    const d = within(await dialog())
    fireEvent.change(await d.findByLabelText('Code on the TV'), { target: { value: 'ab12cd' } })
    fireEvent.click(d.getByRole('button', { name: 'Pair' }))
    expect(await d.findByText('Tele cuarto is paired.')).toBeInTheDocument()
    expect(calls.start).toEqual([{ deviceId: 'tv1' }])
    expect(calls.finish).toEqual([{ deviceId: 'tv1', code: 'AB12CD' }])
  })

  it('keeps the dialog open with the message after a wrong code', async () => {
    const { onClose } = setup({
      finish: () => of({ errors: [{ message: 'Wrong code — check the TV and try again', extensions: { code: 'BAD_USER_INPUT' } }] }),
    })
    const d = within(await dialog())
    fireEvent.change(await d.findByLabelText('Code on the TV'), { target: { value: '000000' } })
    fireEvent.click(d.getByRole('button', { name: 'Pair' }))
    expect(await d.findByText('Wrong code — check the TV and try again')).toBeInTheDocument()
    expect(d.getByLabelText('Code on the TV')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('waits for the request to be accepted on the TV', async () => {
    const { calls } = setup({ mode: 'ACCEPT_ON_TV' })
    const d = within(await dialog())
    expect(await d.findByText(/Tele cuarto is paired\.|Accept the request on the TV/)).toBeInTheDocument()
    expect(await d.findByText('Tele cuarto is paired.')).toBeInTheDocument()
    expect(calls.finish).toEqual([{ deviceId: 'tv1', code: null }])
  })

  it('shows the accept prompt while the TV hasn’t answered', async () => {
    setup({ mode: 'ACCEPT_ON_TV', finish: () => NEVER })
    const d = within(await dialog())
    expect(await d.findByText('Accept the request on the TV')).toBeInTheDocument()
  })

  it('closing before it finishes cancels the pairing', async () => {
    const { calls, onClose } = setup()
    const d = within(await dialog())
    await d.findByLabelText('Code on the TV')
    fireEvent.click(d.getByRole('button', { name: 'Cancel' }))
    await act(async () => {})
    expect(calls.cancel).toEqual([{ deviceId: 'tv1' }])
    expect(onClose).toHaveBeenCalled()
  })
})

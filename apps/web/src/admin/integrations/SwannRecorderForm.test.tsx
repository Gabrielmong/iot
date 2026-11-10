import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { createTestClient, failWith, type Handler, reply } from '../../test/testClient'
import { SwannRecorderForm } from './SwannRecorderForm'

function setup(handler: Handler, configured = false) {
  render(
    <ApolloProvider client={createTestClient({ SetSwannRecorder: handler, Integrations: reply({ integrations: { __typename: 'IntegrationStatus', tuyaCloudConfigured: false, kasaConfigured: false, swannConfigured: true } }) })}>
      <SwannRecorderForm configured={configured} />
    </ApolloProvider>,
  )
}

const found = (channels: number, codecs: string[]) => reply({ setSwannRecorder: { __typename: 'SwannProbeResult', channels, codecs } })

async function submit() {
  fireEvent.change(screen.getByLabelText('Recorder username'), { target: { value: 'admin' } })
  fireEvent.change(screen.getByLabelText('Recorder password'), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test & find cameras' }))
}

describe('SwannRecorderForm', () => {
  it('prefills the IP only when not configured, and masks the password', () => {
    setup(found(1, ['H264']))
    expect(screen.getByLabelText('Recorder IP')).toHaveValue('192.168.0.198')
    expect(screen.getByLabelText('Recorder password')).toHaveAttribute('type', 'password')
  })

  it('does not prefill the IP once configured', () => {
    setup(found(1, ['H264']), true)
    expect(screen.getByLabelText('Recorder IP')).toHaveValue('')
  })

  it('shows the found count, and the H.265 note only when a camera uses it', async () => {
    setup(found(4, ['H264', 'H265']))
    await submit()
    expect(await screen.findByText('Found 4 cameras')).toBeInTheDocument()
    expect(screen.getByText(/converted for browsers \(uses more server CPU\)/)).toBeInTheDocument()
    expect(screen.getByLabelText('Recorder password')).toHaveValue('')
  })

  it('omits the H.265 note for H.264-only recorders', async () => {
    setup(found(2, ['H264']))
    await submit()
    expect(await screen.findByText('Found 2 cameras')).toBeInTheDocument()
    expect(screen.queryByText(/H\.265/)).toBeNull()
  })

  it('shows friendly copy for a rejected login', async () => {
    setup(failWith('SWANN_AUTH_FAILED'))
    await submit()
    expect(await screen.findByText(/rejected that username or password/)).toBeInTheDocument()
  })
})

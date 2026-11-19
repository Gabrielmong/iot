import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { createTestClient, type Handler, reply } from '../../test/testClient'
import { HomeLocationCard } from './HomeLocationCard'

// Google Maps never loads in tests: the map is a button that drops a pin.
vi.mock('./LocationMap', () => ({
  LocationMap: ({ onChange }: { onChange: (v: { lat: number; lng: number }, address?: string) => void }) => (
    <button type="button" onClick={() => onChange({ lat: 10.5, lng: -85.5 }, 'Calle 1, San José')}>
      Drop pin
    </button>
  ),
}))

const SETTINGS = { lat: null, lng: null, address: null, refreshMinutes: 15, staleMinutes: 45, enabled: true, lastError: null }

function setup(mapsApiKey: string | null, settings: Partial<typeof SETTINGS> = {}) {
  const sent: unknown[] = []
  const update: Handler = (op) => {
    sent.push(op.variables.input)
    return reply({ updateWeatherSettings: { __typename: 'WeatherSettings', ...SETTINGS, ...op.variables.input, lastError: null } })(op)
  }
  const client = createTestClient({ MapsApiKey: reply({ mapsApiKey }), UpdateWeatherSettings: update })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <HomeLocationCard settings={{ ...SETTINGS, ...settings }} />
      </MemoryRouter>
    </ApolloProvider>,
  )
  return sent
}

describe('HomeLocationCard', () => {
  it('without a Maps key links to Integrations and takes coordinates', async () => {
    const sent = setup(null)
    expect(await screen.findByRole('link', { name: 'Add a Google Maps key in Integrations' })).toHaveAttribute('href', '/admin/integrations/google-maps')
    const save = screen.getByRole('button', { name: 'Save location' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '9.9' } })
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-84.1' } })
    fireEvent.click(save)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(sent).toEqual([{ lat: 9.9, lng: -84.1, address: null, refreshMinutes: 15, staleMinutes: 45, enabled: true }])
  })

  it('with a Maps key places the pin on the map, keeping the options', async () => {
    const sent = setup('k-1', { refreshMinutes: 30, staleMinutes: 90 })
    fireEvent.click(await screen.findByRole('button', { name: 'Drop pin' }))
    expect(screen.getByText('Calle 1, San José')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save location' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(sent).toEqual([{ lat: 10.5, lng: -85.5, address: 'Calle 1, San José', refreshMinutes: 30, staleMinutes: 90, enabled: true }])
  })

  it('rejects coordinates out of range', async () => {
    setup(null)
    fireEvent.change(await screen.findByLabelText('Latitude'), { target: { value: '91' } })
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '0' } })
    expect(screen.getByText('Latitude must be from -90 to 90')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save location' })).toBeDisabled()
  })
})

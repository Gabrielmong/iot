import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { createTestClient, type Handler, reply } from '../../test/testClient'
import { WeatherOptionsCard } from './WeatherOptionsCard'

const SETTINGS = { lat: 9.93, lng: -84.08, address: 'Home', refreshMinutes: 15, staleMinutes: 45, enabled: true, lastError: null as string | null }

function setup(settings: Partial<typeof SETTINGS> = {}, updatedAt: string | null = null) {
  const sent: unknown[] = []
  const update: Handler = (op) => {
    sent.push(op.variables.input)
    return reply({ updateWeatherSettings: { __typename: 'WeatherSettings', ...SETTINGS, ...op.variables.input, lastError: null } })(op)
  }
  render(
    <ApolloProvider client={createTestClient({ UpdateWeatherSettings: update })}>
      <WeatherOptionsCard settings={{ ...SETTINGS, ...settings }} updatedAt={updatedAt} />
    </ApolloProvider>,
  )
  return sent
}

describe('WeatherOptionsCard', () => {
  it('saves the options, keeping the pin', async () => {
    const sent = setup()
    const save = screen.getByRole('button', { name: 'Save weather options' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Refresh every (minutes)'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Stale after (minutes)'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Fetch the weather' }))
    fireEvent.click(save)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(sent).toEqual([{ lat: 9.93, lng: -84.08, address: 'Home', refreshMinutes: 30, staleMinutes: 120, enabled: false }])
  })

  it('checks the refresh interval', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Refresh every (minutes)'), { target: { value: '4' } })
    expect(screen.getByText('Refresh every 5 to 120 minutes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save weather options' })).toBeDisabled()
  })

  it('checks stale-after against the refresh interval', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Stale after (minutes)'), { target: { value: '10' } })
    expect(screen.getByText('Stale-after must be from the refresh interval up to 720 minutes')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Stale after (minutes)'), { target: { value: '721' } })
    expect(screen.getByText('Stale-after must be from the refresh interval up to 720 minutes')).toBeInTheDocument()
  })

  it('shows the last error and when the weather was updated', () => {
    setup({ lastError: "Couldn't reach Xweather" }, new Date(Date.now() - 5 * 60_000).toISOString())
    expect(screen.getByText("Couldn't reach Xweather")).toBeInTheDocument()
    expect(screen.getByText('Updated 5 min ago')).toBeInTheDocument()
  })
})

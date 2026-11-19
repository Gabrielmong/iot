import { ApolloProvider } from '@apollo/client/react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { setToken } from '../auth/session'
import { emptyWeather, weatherFixture } from '../test/weatherFixtures'
import { createTestClient, liveSubscription, reply } from '../test/testClient'
import { WeatherPage } from './WeatherPage'

const me = (role: string) => ({ me: { __typename: 'User', id: 'u1', name: 'Alice', avatarColor: '#43a047', avatarImage: null, role, hasPin: true } })

function renderWith(weather: ReturnType<typeof weatherFixture>, role = 'USER') {
  setToken('t')
  const client = createTestClient({ Me: reply(me(role)), Weather: reply({ weather }), WeatherUpdated: liveSubscription().handler })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    </ApolloProvider>,
  )
}

describe('WeatherPage', () => {
  it('shows the current weather, the next hours, the next days and the sun', async () => {
    renderWith(weatherFixture())
    expect(await screen.findByText('24°')).toBeInTheDocument()
    expect(screen.getByText('Sunny')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Next hours' })).getAllByRole('listitem')).toHaveLength(12)
    expect(within(screen.getByRole('list', { name: 'Next days' })).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText(/Sunrise/)).toBeInTheDocument()
    expect(screen.getByText(/Sunset/)).toBeInTheDocument()
  })

  it('warns when the weather is out of date', async () => {
    renderWith(weatherFixture({ stale: true, updatedAt: new Date(Date.now() - 60 * 60_000).toISOString() }))
    expect(await screen.findByText('Updated 1 h ago')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Updated 1 h ago')
  })

  it('says when weather is not set up, linking admins to Integrations', async () => {
    renderWith(emptyWeather('NOT_CONFIGURED'), 'ADMIN')
    expect(await screen.findByText("Weather isn't set up")).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Open Integrations' })).toHaveAttribute('href', '/admin/integrations/xweather')
  })

  it('asks for the home location, linking admins to Settings', async () => {
    renderWith(emptyWeather('NO_LOCATION'), 'ADMIN')
    expect(await screen.findByText('Set the home location')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/admin/settings')
  })

  it('gives other users no admin links', async () => {
    renderWith(emptyWeather('NO_LOCATION'))
    expect(await screen.findByText('Set the home location')).toBeInTheDocument()
    expect(screen.getByText('Ask an admin to place the home on the map.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

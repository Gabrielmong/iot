import { ApolloProvider } from '@apollo/client/react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { NEVER } from 'rxjs'
import { setToken } from '../auth/session'
import { emptyWeather, weatherFixture } from '../test/weatherFixtures'
import { createTestClient, type Handler, liveSubscription, reply } from '../test/testClient'
import { WeatherStrip } from './WeatherStrip'

const me = (role: string) => ({ me: { __typename: 'User', id: 'u1', name: 'Alice', avatarColor: '#43a047', avatarImage: null, role, hasPin: true } })

function renderWith(weather: Handler, role = 'USER') {
  setToken('t')
  const client = createTestClient({ Me: reply(me(role)), Weather: weather, WeatherUpdated: liveSubscription().handler })
  const { container } = render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <WeatherStrip />
      </MemoryRouter>
    </ApolloProvider>,
  )
  return container
}

/** Lets the replies and Me arrive. */
const settle = () => new Promise((r) => setTimeout(r, 20))

describe('WeatherStrip', () => {
  it('shows now and today in one row that opens the weather page', async () => {
    renderWith(reply({ weather: weatherFixture() }))
    const link = await screen.findByRole('link', { name: /24°/ })
    expect(link).toHaveAttribute('href', '/weather')
    expect(link).toHaveTextContent('Sunny')
    expect(link).toHaveTextContent('H 27° · L 17°')
    expect(link).toHaveTextContent('Rain 60%')
  })

  it('says how old a stale reading is', async () => {
    renderWith(reply({ weather: weatherFixture({ stale: true, status: 'ERROR', updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString() }) }))
    const link = await screen.findByRole('link', { name: /24°/ })
    expect(link).toHaveTextContent(/Updated 3 h/)
  })

  it.each(['NOT_CONFIGURED', 'DISABLED'] as const)('shows nothing while weather is %s', async (status) => {
    const container = renderWith(reply({ weather: emptyWeather(status) }), 'ADMIN')
    await settle()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing while loading', async () => {
    const container = renderWith(() => NEVER, 'ADMIN')
    await settle()
    expect(container).toBeEmptyDOMElement()
  })

  it('asks admins to set the home location', async () => {
    renderWith(reply({ weather: emptyWeather('NO_LOCATION') }), 'ADMIN')
    expect(await screen.findByRole('link', { name: 'Set the home location' })).toHaveAttribute('href', '/admin/settings')
  })

  it('shows other users nothing without a location', async () => {
    renderWith(reply({ weather: emptyWeather('NO_LOCATION') }))
    await settle()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

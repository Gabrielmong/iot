import { render, screen, within } from '@testing-library/react'
import { emptyWeather, weatherFixture } from '../../test/weatherFixtures'
import { WeatherWidget } from './WeatherWidget'

describe('WeatherWidget', () => {
  it('shows the temperature and the condition at 1×1', () => {
    render(<WeatherWidget weather={weatherFixture()} size="S1x1" />)
    expect(screen.getByText('24°')).toBeInTheDocument()
    expect(screen.getByText('Sunny')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it("adds today's high, low and rain chance at 2×1", () => {
    render(<WeatherWidget weather={weatherFixture()} size="W2x1" />)
    expect(screen.getByText('H 27° · L 17°')).toBeInTheDocument()
    expect(screen.getByText('Rain 60%')).toBeInTheDocument()
  })

  it('lists the next 6 hours at 1×2', () => {
    render(<WeatherWidget weather={weatherFixture()} size="T1x2" />)
    expect(within(screen.getByRole('list', { name: 'Next hours' })).getAllByRole('listitem')).toHaveLength(6)
  })

  it('adds the hours and 5 days at 2×2', () => {
    render(<WeatherWidget weather={weatherFixture()} size="L2x2" />)
    expect(screen.getByRole('list', { name: 'Next hours' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Next days' })).getAllByRole('listitem')).toHaveLength(5)
  })

  it('says why there is no reading', () => {
    render(<WeatherWidget weather={emptyWeather('NO_LOCATION')} size="W2x1" />)
    expect(screen.getByText('Set the home location')).toBeInTheDocument()
  })
  it('says how old a stale reading is', () => {
    const now = Date.now()
    render(<WeatherWidget weather={weatherFixture({ stale: true, status: 'ERROR', updatedAt: new Date(now - 3 * 3_600_000).toISOString() })} size="S1x1" />)
    expect(screen.getByText(/^Updated 3 h/)).toBeInTheDocument()
  })

  it('leaves out the age while the reading is fresh', () => {
    render(<WeatherWidget weather={weatherFixture()} size="S1x1" />)
    expect(screen.queryByText(/^Updated/)).not.toBeInTheDocument()
  })
})

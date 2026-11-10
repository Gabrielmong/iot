import { render, screen } from '@testing-library/react'
import { deployEventFixture } from '../../test/deployFixtures'
import { DeployEventRow } from './DeployEventRow'

const renderRow = (o = {}) =>
  render(<DeployEventRow event={deployEventFixture(o)} selected={false} disabled={false} onSelect={() => {}} onRollback={() => {}} />)

describe('DeployEventRow', () => {
  it('shows the title, who and the duration', () => {
    renderRow()
    expect(screen.getByText('Deploy abc1234')).toBeInTheDocument()
    expect(screen.getByText(/Auto/)).toBeInTheDocument()
    expect(screen.getByText(/3m 10s/)).toBeInTheDocument()
  })

  it('names the person who ran a command', () => {
    renderRow({ kind: 'RESTART', sha: null, message: null, by: 'Gabriel', finishedAt: null })
    expect(screen.getByText('Restart')).toBeInTheDocument()
    expect(screen.getByText(/Gabriel/)).toBeInTheDocument()
  })

  it('shows why a commit was skipped', () => {
    renderRow({ status: 'SKIPPED', finishedAt: null, detail: 'tests red on GitHub' })
    expect(screen.getByText(/tests red on GitHub/)).toBeInTheDocument()
  })
})

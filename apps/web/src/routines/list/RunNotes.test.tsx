import { render, screen } from '@testing-library/react'
import { runFixture } from '../../test/routineFixtures'
import { RunNotes } from './RunNotes'

const notes = (list: NonNullable<Parameters<typeof runFixture>[3]>['notes']) => runFixture('OK', [], 0, { notes: list }).notes

describe('RunNotes', () => {
  it('says which way each weather check went', () => {
    render(
      <RunNotes
        notes={notes([
          { kind: 'IF_MET', conditions: 'temperature above 28°', ranRoutineName: 'Cool down' },
          { kind: 'IF_NOT_MET', conditions: 'the sun is up', ranRoutineName: 'Lights on', step: 1 },
          { kind: 'IF_NOT_MET', conditions: 'raining now', step: 2 },
          { kind: 'STOPPED', conditions: 'raining now', step: 3 },
          { kind: 'STOPPED', conditions: 'the sun is down', step: 4, routineName: 'Lock up' },
        ])}
      />,
    )
    expect(screen.getByText('If temperature above 28° → ran Cool down')).toBeInTheDocument()
    expect(screen.getByText("If the sun is up wasn't met → ran Lights on")).toBeInTheDocument()
    expect(screen.getByText("If raining now wasn't met")).toBeInTheDocument()
    expect(screen.getByText("Stopped: raining now wasn't met")).toBeInTheDocument()
    expect(screen.getByText("Lock up › Stopped: the sun is down wasn't met")).toBeInTheDocument()
  })

  it('shows nothing without notes', () => {
    const { container } = render(<RunNotes notes={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

import { ApolloProvider } from '@apollo/client/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { of } from 'rxjs'
import { openUrl } from '../../../device/computer/openUrl'
import { createTestClient } from '../../../test/testClient'
import { AdoptPcDialog } from './AdoptPcDialog'

vi.mock('../../../device/computer/openUrl', () => ({ openUrl: vi.fn() }))

const URL = '/agent/download/abc123'

function setup(onClose = vi.fn()) {
  let created = 0
  const client = createTestClient({
    CreateAgentEnrollment: () => {
      created += 1
      return of({
        data: { createAgentEnrollment: { __typename: 'AgentEnrollment', downloadUrl: URL, expiresAt: '2026-11-18T10:30:00.000Z' } },
      })
    },
  })
  render(
    <ApolloProvider client={client}>
      <AdoptPcDialog onClose={onClose} />
    </ApolloProvider>,
  )
  return { created: () => created, onClose }
}

describe('AdoptPcDialog', () => {
  beforeEach(() => vi.mocked(openUrl).mockClear())

  it('explains how the download works', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Adopt this PC' })).toBeInTheDocument()
    expect(screen.getByText(/Open this on the PC you want to add/)).toHaveTextContent(
      "Open this on the PC you want to add. Download the agent and run it; Windows may warn that it's from an unknown publisher: choose More info › Run anyway. The PC appears here once the agent connects. The download works once, for 30 minutes.",
    )
  })

  it('creates a one-time link and opens it', async () => {
    const { created, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Download the agent' }))
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(URL))
    expect(created()).toBe(1)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})

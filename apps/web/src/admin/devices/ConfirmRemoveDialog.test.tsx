import { ApolloProvider } from '@apollo/client/react'
import { render, screen } from '@testing-library/react'
import { createTestClient } from '../../test/testClient'
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog'

const UNINSTALL = 'The agent on the PC will uninstall itself.'

function setup(hasAgent: boolean | undefined) {
  render(
    <ApolloProvider client={createTestClient({})}>
      <ConfirmRemoveDialog device={{ id: 'pc1', name: 'Office PC' }} outletCount={0} hasAgent={hasAgent} onClose={vi.fn()} />
    </ApolloProvider>,
  )
}

describe('ConfirmRemoveDialog', () => {
  it('says the agent uninstalls itself when the PC has one', () => {
    setup(true)
    expect(screen.getByRole('dialog')).toHaveTextContent(UNINSTALL)
  })

  it.each([false, undefined])("doesn't mention an agent otherwise (hasAgent %s)", (hasAgent) => {
    setup(hasAgent)
    expect(screen.getByRole('dialog')).not.toHaveTextContent('agent')
  })
})

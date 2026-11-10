import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { commandErrorMessage } from './commandErrorMessage'

const graphqlError = (code: string) =>
  new CombinedGraphQLErrors({ errors: [{ message: code, extensions: { code } }] })

describe('commandErrorMessage', () => {
  it('says the device could not be reached', () => {
    expect(commandErrorMessage(graphqlError('DEVICE_UNREACHABLE'), 'Lamp')).toBe("Couldn't reach Lamp")
    expect(commandErrorMessage(new Error('network down'), 'Lamp')).toBe("Couldn't reach Lamp")
  })

  it('says a not-ready device needs setup', () => {
    expect(commandErrorMessage(graphqlError('DEVICE_NOT_READY'), 'Lamp')).toBe('Lamp needs setup')
  })
})

import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { routineErrorMessage } from './routineErrorMessage'

const gqlError = (code: string, message: string) => new CombinedGraphQLErrors({ errors: [{ message, extensions: { code } }] })

describe('routineErrorMessage', () => {
  it("shows the server's message for input and access problems", () => {
    expect(routineErrorMessage(gqlError('BAD_USER_INPUT', 'Waits must be 1 to 720 minutes'))).toBe('Waits must be 1 to 720 minutes')
    expect(routineErrorMessage(gqlError('FORBIDDEN', 'No access to Lamp'))).toBe('No access to Lamp')
  })

  it('explains a routine that disappeared', () => {
    expect(routineErrorMessage(gqlError('NOT_FOUND', 'Routine not found'))).toBe('That routine no longer exists.')
  })

  it('falls back to a generic message', () => {
    expect(routineErrorMessage(new Error('network'))).toBe('Something went wrong. Try again.')
  })
})

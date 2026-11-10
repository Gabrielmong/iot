import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { ignoreUnauthenticated } from './ignoreUnauthenticated'

const gql = (code: string) => new CombinedGraphQLErrors({ errors: [{ message: 'x', extensions: { code } }] })

describe('ignoreUnauthenticated', () => {
  it('swallows UNAUTHENTICATED', async () => {
    await expect(ignoreUnauthenticated(() => Promise.reject(gql('UNAUTHENTICATED')))).resolves.toBeUndefined()
  })
  it('rethrows other errors', async () => {
    await expect(ignoreUnauthenticated(() => Promise.reject(gql('BAD_USER_INPUT')))).rejects.toBeTruthy()
  })
})

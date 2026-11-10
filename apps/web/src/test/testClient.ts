import { ApolloClient, InMemoryCache } from '@apollo/client'
import { ApolloLink } from '@apollo/client/link'
import { Observable, of, Subject, throwError } from 'rxjs'

type Result = ApolloLink.Result
export type Handler = (operation: ApolloLink.Operation) => Observable<Result>

/** An Apollo client whose link answers each operation (by name) with the given handler. */
export function createTestClient(handlers: Record<string, Handler>) {
  const link = new ApolloLink((operation) => {
    const handler = handlers[operation.operationName ?? '']
    return handler ? handler(operation) : throwError(() => new Error(`No handler for ${operation.operationName}`))
  })
  return new ApolloClient({ link, cache: new InMemoryCache() })
}

export const reply = (data: Record<string, unknown>): Handler => () => of({ data })

export const failWith = (code: string): Handler => () => of({ errors: [{ message: code, extensions: { code } }] })

/** A subscription you can push events into with `next`. */
export function liveSubscription() {
  const subject = new Subject<Result>()
  return {
    handler: (() => subject.asObservable()) as Handler,
    next: (data: Record<string, unknown>) => subject.next({ data }),
  }
}

import { retryDelay } from './retryDelay'

describe('retryDelay', () => {
  it('backs off 2 s, 5 s, 10 s, then every 30 s', () => {
    expect([1, 2, 3, 4, 5, 6].map(retryDelay)).toEqual([2000, 5000, 10000, 30000, 30000, 30000])
  })
})

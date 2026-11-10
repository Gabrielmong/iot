import { initialPlayerState, isLive, type PlayerAction, type PlayerState, playerReducer, type StreamFailure } from './playerMachine'

const run = (...actions: PlayerAction[]): PlayerState => actions.reduce(playerReducer, initialPlayerState)
const fail = (failure: StreamFailure): PlayerAction => ({ type: 'failed', failure })

describe('playerReducer', () => {
  it('ends in cloudUnavailable when the Tuya cloud refuses, on either transport, without falling back', () => {
    expect(run(fail('cloud'))).toMatchObject({ transport: 'webrtc', phase: 'cloudUnavailable' })
    expect(run(fail('fallback'), fail('cloud'))).toMatchObject({ transport: 'mse', phase: 'cloudUnavailable' })
    const refused = run(fail('cloud'))
    expect(playerReducer(refused, { type: 'playing' })).toBe(refused)
    expect(playerReducer(refused, { type: 'pause' }).phase).toBe('paused')
  })

  it('starts on WebRTC and falls back to MSE, then gives up', () => {
    expect(run(fail('fallback'))).toEqual({ transport: 'mse', phase: 'connecting', attempt: 1 })
    expect(run(fail('fallback'), fail('fallback')).phase).toBe('unavailable')
  })

  it('does not fall back on unavailable, and ends on session', () => {
    expect(run(fail('unavailable'))).toMatchObject({ transport: 'webrtc', phase: 'unavailable' })
    expect(run(fail('session')).phase).toBe('ended')
  })

  it('retries a dropped stream once on the same transport, with a fresh attempt', () => {
    const dropped = run({ type: 'playing' }, { type: 'dropped' })
    expect(dropped.phase).toBe('retrying')
    expect(playerReducer(dropped, { type: 'retry' })).toEqual({ transport: 'webrtc', phase: 'connecting', attempt: 1 })
  })

  it('ends terminally when the retry is refused', () => {
    expect(run({ type: 'playing' }, { type: 'dropped' }, { type: 'retry' }, fail('unavailable')).phase).toBe('unavailable')
  })

  it('ignores late events from a session that is no longer current', () => {
    const unavailable = run(fail('unavailable'))
    expect(playerReducer(unavailable, { type: 'playing' })).toBe(unavailable)
    expect(playerReducer(unavailable, { type: 'dropped' })).toBe(unavailable)
    expect(playerReducer(unavailable, fail('fallback'))).toBe(unavailable)
  })

  it('pauses while hidden and starts over from WebRTC when resumed', () => {
    const paused = run(fail('fallback'), { type: 'playing' }, { type: 'pause' })
    expect(isLive(paused, 'mse')).toBe(false)
    expect(playerReducer(paused, { type: 'resume' })).toEqual({ transport: 'webrtc', phase: 'connecting', attempt: 2 })
  })

  it('resume does nothing unless paused, and an ended session never restarts', () => {
    expect(run({ type: 'resume' })).toBe(initialPlayerState)
    expect(run(fail('session'), { type: 'pause' }, { type: 'resume' }).phase).toBe('ended')
  })
})

export type Transport = 'webrtc' | 'mse'

/** Why a stream attempt failed: try the next transport, give up ("Camera unavailable"), the Tuya cloud refused, or the session ended. */
export type StreamFailure = 'fallback' | 'unavailable' | 'cloud' | 'session'

/** What a transport session reports. */
export type StreamEvent = { type: 'playing' } | { type: 'dropped' } | { type: 'failed'; failure: StreamFailure }

export type PlayerAction = StreamEvent | { type: 'retry' } | { type: 'pause' } | { type: 'resume' }

export type PlayerPhase = 'connecting' | 'playing' | 'retrying' | 'paused' | 'unavailable' | 'cloudUnavailable' | 'ended'

/** `attempt` changes whenever a fresh session must be started. */
export type PlayerState = { transport: Transport; phase: PlayerPhase; attempt: number }

export const initialPlayerState: PlayerState = { transport: 'webrtc', phase: 'connecting', attempt: 0 }

/**
 * WebRTC first; a failure that is not "unavailable"/"cloud"/"session" falls back to MSE, and MSE failing
 * means unavailable. A playing stream that drops is retried once (same transport) after a delay;
 * that retry either plays again or ends in a terminal phase, so nothing loops without a real stream.
 * `pause` (the page was hidden) stops everything; `resume` (visible again) then starts over from
 * WebRTC. Once the session has ended nothing restarts.
 */
export function playerReducer(s: PlayerState, a: PlayerAction): PlayerState {
  switch (a.type) {
    case 'playing':
      return s.phase === 'connecting' ? { ...s, phase: 'playing' } : s
    case 'dropped':
      return s.phase === 'playing' ? { ...s, phase: 'retrying' } : s
    case 'retry':
      return s.phase === 'retrying' ? { ...s, phase: 'connecting', attempt: s.attempt + 1 } : s
    case 'pause':
      return s.phase === 'ended' ? s : { ...s, phase: 'paused' }
    case 'resume':
      return s.phase === 'paused' ? { transport: 'webrtc', phase: 'connecting', attempt: s.attempt + 1 } : s
    case 'failed':
      if (s.phase !== 'connecting' && s.phase !== 'playing') return s
      if (a.failure === 'session') return { ...s, phase: 'ended' }
      if (a.failure === 'cloud') return { ...s, phase: 'cloudUnavailable' }
      if (a.failure === 'fallback' && s.transport === 'webrtc') {
        return { transport: 'mse', phase: 'connecting', attempt: s.attempt + 1 }
      }
      return { ...s, phase: 'unavailable' }
  }
}

/** Whether a transport's session should be running now. */
export const isLive = (s: PlayerState, transport: Transport): boolean =>
  s.transport === transport && (s.phase === 'connecting' || s.phase === 'playing')

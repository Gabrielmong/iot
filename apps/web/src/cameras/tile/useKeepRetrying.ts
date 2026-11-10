import { useEffect, useRef, useState } from 'react'
import type { PlayerPhase } from '../../device/lib/playerMachine'
import { retryDelay } from '../lib/retryDelay'

const GAVE_UP = new Set<PlayerPhase>(['unavailable', 'cloudUnavailable'])

/**
 * For grid tiles, which should never stay dead: after the player gives up, waits (2 s, 5 s, 10 s, then
 * 30 s) and bumps the returned `generation`, which the tile uses as a key to start a fresh player.
 * Playing resets the backoff; an ended session (signed out) is left alone.
 */
export function useKeepRetrying(phase: PlayerPhase): number {
  const [generation, setGeneration] = useState(0)
  const failures = useRef(0)
  useEffect(() => {
    if (phase === 'playing') failures.current = 0
    if (!GAVE_UP.has(phase)) return
    failures.current += 1
    const timer = setTimeout(() => setGeneration((g) => g + 1), retryDelay(failures.current))
    return () => clearTimeout(timer)
  }, [phase, generation])
  return generation
}

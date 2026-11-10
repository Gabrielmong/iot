import { useCallback, useState } from 'react'
import { useUpdateRoom } from '../data/useRoomMutations'
import { reorderRooms } from '../lib/reorderRooms'
import type { Room } from '../types'

/**
 * `move(rooms, id, direction)` persists the new order and ignores calls while a move is in flight
 * (`moving`), so a second click cannot race the first. Failures go to `onError`.
 */
export function useMoveRoom(onError: (message: string) => void) {
  const update = useUpdateRoom()
  const [moving, setMoving] = useState(false)
  const move = useCallback(
    async (rooms: readonly Room[], id: string, direction: 'up' | 'down') => {
      if (moving) return
      setMoving(true)
      try {
        for (const change of reorderRooms(rooms, id, direction)) await update(change.id, { sortOrder: change.sortOrder })
      } catch {
        onError("Couldn't reorder rooms. Try again.")
      } finally {
        setMoving(false)
      }
    },
    [update, onError, moving],
  )
  return { move, moving }
}

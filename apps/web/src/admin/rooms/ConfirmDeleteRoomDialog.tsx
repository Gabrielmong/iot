import { ConfirmDialog } from '../common/ConfirmDialog'
import { useDeleteRoom } from '../data/useRoomMutations'
import type { Room } from '../types'

export function ConfirmDeleteRoomDialog({ room, onClose }: { room: Room; onClose: () => void }) {
  const deleteRoom = useDeleteRoom()
  return (
    <ConfirmDialog title={`Delete ${room.name}?`} confirmLabel="Delete" onConfirm={() => deleteRoom(room.id)} onClose={onClose}>
      Devices in {room.name} stay, but become unassigned.
    </ConfirmDialog>
  )
}

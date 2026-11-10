import { useCreateRoom, useUpdateRoom } from '../data/useRoomMutations'
import type { Room } from '../types'
import { ConfirmDeleteRoomDialog } from './ConfirmDeleteRoomDialog'
import { RoomNameDialog } from './RoomNameDialog'

export type RoomDialogState = { type: 'create' } | { type: 'rename' | 'delete'; room: Room } | null

/** Renders whichever room dialog is open. */
export function RoomDialogs({ state, onClose }: { state: RoomDialogState; onClose: () => void }) {
  const create = useCreateRoom()
  const update = useUpdateRoom()
  if (!state) return null
  switch (state.type) {
    case 'create':
      return <RoomNameDialog title="Add room" submitLabel="Add" initialName="" onSave={create} onClose={onClose} />
    case 'rename':
      return (
        <RoomNameDialog
          title={`Rename ${state.room.name}`}
          submitLabel="Save"
          initialName={state.room.name}
          onSave={(name) => update(state.room.id, { name })}
          onClose={onClose}
        />
      )
    case 'delete':
      return <ConfirmDeleteRoomDialog room={state.room} onClose={onClose} />
  }
}

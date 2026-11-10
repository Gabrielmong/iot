import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { FormDialog } from '../common/FormDialog'
import { useUpdateDevice } from '../data/useDeviceMutations'
import type { AdminDevice, Room } from '../types'
import { RoomSelect } from './RoomSelect'

type Props = { device: Pick<AdminDevice, 'id' | 'name' | 'room'>; rooms: readonly Room[]; onClose: () => void }

/** Rename a device and/or move it to another room. */
export function RenameMoveDialog({ device, rooms, onClose }: Props) {
  const update = useUpdateDevice()
  const [name, setName] = useState(device.name)
  const [roomId, setRoomId] = useState(device.room?.id ?? '')
  return (
    <FormDialog
      title={`Edit ${device.name}`}
      submitLabel="Save"
      canSubmit={name.trim() !== ''}
      onSubmit={() => update({ id: device.id, name: name.trim(), roomId: roomId || null })}
      onClose={onClose}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
      <RoomSelect rooms={rooms} value={roomId} onChange={setRoomId} />
    </FormDialog>
  )
}

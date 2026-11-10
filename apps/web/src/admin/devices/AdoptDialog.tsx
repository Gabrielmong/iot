import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { FormDialog } from '../common/FormDialog'
import { useAdoptDevice } from '../data/useAdoptDevice'
import type { DeviceKind } from '../../gql/graphql'
import type { AdminDevice, Room } from '../types'
import { KindSelect } from './KindSelect'
import { RoomSelect } from './RoomSelect'

type Props = { device: AdminDevice; rooms: readonly Room[]; onClose: () => void }

/** Adopt a discovered device: give it a name, a room and a kind. */
export function AdoptDialog({ device, rooms, onClose }: Props) {
  const adopt = useAdoptDevice()
  const [name, setName] = useState(device.name)
  const [roomId, setRoomId] = useState(device.room?.id ?? '')
  const [kind, setKind] = useState<string>(device.kind)
  return (
    <FormDialog
      title="Adopt device"
      submitLabel="Adopt"
      canSubmit={name.trim() !== ''}
      onSubmit={() => adopt({ id: device.id, name: name.trim(), roomId: roomId || null, kind: kind as DeviceKind })}
      onClose={onClose}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
      <RoomSelect rooms={rooms} value={roomId} onChange={setRoomId} />
      <KindSelect value={kind} onChange={setKind} />
    </FormDialog>
  )
}

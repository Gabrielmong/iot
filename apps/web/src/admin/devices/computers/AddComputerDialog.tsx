import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { WakeSetupChecklist } from '../../../device/computer/WakeSetupChecklist'
import { FormDialog } from '../../common/FormDialog'
import { useAddComputer } from '../../data/useTvComputerMutations'
import type { Room } from '../../types'
import { RoomSelect } from '../RoomSelect'
import { isValidMac } from '../../lib/macAddress'
import { MacIpFields } from './MacIpFields'

/** Add a PC by hand for Wake-on-LAN: name, room, MAC and an optional IP. */
export function AddComputerDialog({ rooms, onClose }: { rooms: readonly Room[]; onClose: () => void }) {
  const add = useAddComputer()
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [mac, setMac] = useState('')
  const [ip, setIp] = useState('')
  return (
    <FormDialog
      title="Add PC"
      submitLabel="Add"
      canSubmit={name.trim() !== '' && isValidMac(mac)}
      onSubmit={() => add({ name: name.trim(), roomId: roomId || null, mac: mac.trim(), ip: ip.trim() || null })}
      onClose={onClose}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
      <RoomSelect rooms={rooms} value={roomId} onChange={setRoomId} />
      <MacIpFields mac={mac} ip={ip} onMac={setMac} onIp={setIp} />
      <WakeSetupChecklist />
    </FormDialog>
  )
}

import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Device, Room } from '../types'
import { roomStatus } from './lib/roomStatus'

/** A room's name, what is on there and what isn't responding. The tile opens the room. */
export function RoomWidget({ room, devices }: { room: Room; devices: readonly Device[] }) {
  const { on, offline } = roomStatus(devices, room.id)
  return (
    <Stack spacing={0.5} sx={{ height: '100%', p: 2, overflow: 'hidden' }}>
      <MeetingRoomOutlinedIcon sx={{ color: 'text.secondary' }} aria-hidden />
      <Typography sx={{ fontWeight: 700 }} noWrap>
        {room.name}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {on}
      </Typography>
      {offline && (
        <Typography variant="body2" color="warning.main">
          {offline}
        </Typography>
      )}
    </Stack>
  )
}

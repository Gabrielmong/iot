import Box from '@mui/material/Box'
import { useDevices } from '../data/useDevices'
import { useRooms } from '../data/useRooms'
import { DeviceGridSkeleton } from '../DeviceGridSkeleton'
import { roomSummaries } from '../lib/roomSummaries'
import { WeatherStrip } from '../../weather/WeatherStrip'
import { RoomCard } from './RoomCard'

/** The phone's Rooms page: the weather row, then a card per room, then "All devices". */
export function RoomGrid() {
  const { devices, loading } = useDevices()
  const rooms = useRooms()
  if (loading && devices.length === 0) return <DeviceGridSkeleton />
  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <WeatherStrip />
      <Box component="ul" aria-label="Rooms" sx={{ m: 0, p: 0, display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {roomSummaries(devices, rooms).map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </Box>
    </Box>
  )
}

import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { Link } from 'react-router'
import { palette } from '../../theme/tokens'
import type { RoomSummary } from '../lib/roomSummaries'
import { roomCaption } from './roomCaption'

/** One room on the phone's home grid; lit up when something in it is on. */
export function RoomCard({ room }: { room: RoomSummary }) {
  const lit = room.onCount > 0
  return (
    <Card
      component="li"
      variant="outlined"
      sx={{ listStyle: 'none', borderRadius: 3, borderColor: lit ? alpha(palette.lamp, 0.4) : 'divider', bgcolor: lit ? alpha(palette.lamp, 0.08) : undefined }}
    >
      <CardActionArea component={Link} to={`/rooms/${room.id}`} sx={{ p: 2, minHeight: 88, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
        <Typography component="span" sx={{ fontWeight: 700, fontSize: 17, lineHeight: 1.25 }}>
          {room.name}
        </Typography>
        <Typography component="span" variant="body2" sx={{ color: lit ? 'primary.main' : 'text.secondary', mt: 0.5 }}>
          {roomCaption(room)}
        </Typography>
      </CardActionArea>
    </Card>
  )
}

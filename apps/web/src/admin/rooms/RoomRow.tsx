import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import IconButton from '@mui/material/IconButton'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import type { Room } from '../types'

type Props = {
  room: Room
  isFirst: boolean
  isLast: boolean
  /** Disables the move buttons (a move is in flight). */
  moving: boolean
  onMove: (direction: 'up' | 'down') => void
  onRename: () => void
  onDelete: () => void
}

/** One room with move up/down, rename and delete buttons. */
export function RoomRow({ room, isFirst, isLast, moving, onMove, onRename, onDelete }: Props) {
  return (
    <ListItem divider>
      <ListItemText primary={room.name} />
      <IconButton aria-label={`Move ${room.name} up`} disabled={isFirst || moving} onClick={() => onMove('up')} size="large">
        <ArrowUpwardIcon />
      </IconButton>
      <IconButton aria-label={`Move ${room.name} down`} disabled={isLast || moving} onClick={() => onMove('down')} size="large">
        <ArrowDownwardIcon />
      </IconButton>
      <IconButton aria-label={`Rename ${room.name}`} onClick={onRename} size="large">
        <EditIcon />
      </IconButton>
      <IconButton aria-label={`Delete ${room.name}`} onClick={onDelete} size="large">
        <DeleteIcon />
      </IconButton>
    </ListItem>
  )
}

import Button from '@mui/material/Button'
import List from '@mui/material/List'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useRoomsQuery } from '../dashboard/data/useRooms'
import { ErrorSnackbar } from '../dashboard/ErrorSnackbar'
import { PageSection } from './common/PageSection'
import { QueryError } from './common/QueryError'
import { RoomDialogs, type RoomDialogState } from './rooms/RoomDialogs'
import { RoomRow } from './rooms/RoomRow'
import { useMoveRoom } from './rooms/useMoveRoom'

/** Admin rooms: add, rename, reorder and delete. */
export function RoomsPage() {
  const query = useRoomsQuery()
  const rooms = [...query.rooms].sort((a, b) => a.sortOrder - b.sortOrder)
  const [dialog, setDialog] = useState<RoomDialogState>(null)
  const [error, setError] = useState<string | null>(null)
  const { move, moving } = useMoveRoom(setError)

  if (query.error && !query.hasData) return <QueryError what="rooms" onRetry={query.retry} />

  return (
    <PageSection title="Rooms" actions={<Button variant="contained" size="large" onClick={() => setDialog({ type: 'create' })}>Add room</Button>}>
      {rooms.length === 0 ? (
        <Typography color="text.secondary">No rooms yet.</Typography>
      ) : (
        <List disablePadding>
          {rooms.map((room, index) => (
            <RoomRow
              key={room.id}
              room={room}
              isFirst={index === 0}
              isLast={index === rooms.length - 1}
              moving={moving}
              onMove={(direction) => void move(rooms, room.id, direction)}
              onRename={() => setDialog({ type: 'rename', room })}
              onDelete={() => setDialog({ type: 'delete', room })}
            />
          ))}
        </List>
      )}
      <RoomDialogs state={dialog} onClose={() => setDialog(null)} />
      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </PageSection>
  )
}

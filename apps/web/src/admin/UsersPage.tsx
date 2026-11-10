import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { useState } from 'react'
import { useCurrentUser } from '../auth/useCurrentUser'
import { PageSection } from './common/PageSection'
import { QueryError } from './common/QueryError'
import { useUsers } from './data/useUsers'
import { UserCard } from './users/UserCard'
import { type UserDialogState, UserDialogs } from './users/UserDialogs'

/** Admin users: a grid of cards, create/edit, per-user device access, delete. */
export function UsersPage() {
  const { users, loading, error, hasData, retry } = useUsers()
  const { user: me } = useCurrentUser()
  const [dialog, setDialog] = useState<UserDialogState>(null)

  if (error && !hasData) return <QueryError what="users" onRetry={retry} />
  if (loading && users.length === 0) return <CircularProgress aria-label="Loading users" />

  return (
    <PageSection title="Users" actions={<Button variant="contained" size="large" onClick={() => setDialog({ type: 'create' })}>Add user</Button>}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {users.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            onEdit={() => setDialog({ type: 'edit', user })}
            onAccess={() => setDialog({ type: 'access', user })}
            onDelete={() => setDialog({ type: 'delete', user })}
          />
        ))}
      </Box>
      <UserDialogs state={dialog} currentUserId={me?.id} onClose={() => setDialog(null)} />
    </PageSection>
  )
}

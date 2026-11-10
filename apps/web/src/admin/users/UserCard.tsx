import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import type { AdminUser } from '../types'
import { UserAvatar } from '../../avatars/UserAvatar'
import { UserCardAction } from './UserCardAction'

const ROLE_LABEL = { ADMIN: 'Admin', USER: 'User', GUEST: 'Guest' } as const

type Props = { user: AdminUser; onEdit: () => void; onAccess: () => void; onDelete: () => void }

/** One user as a card: avatar washed in their color, name, role, and access / edit / delete actions. */
export function UserCard({ user, onEdit, onAccess, onDelete }: Props) {
  const isAdmin = user.role === 'ADMIN'
  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: `linear-gradient(180deg, color-mix(in srgb, ${user.avatarColor} 18%, transparent) 0%, transparent 55%)`,
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, pt: 3, pb: 2, px: 2, minWidth: 0 }}>
        <UserAvatar name={user.name} color={user.avatarColor} image={user.avatarImage} size={72} glow />
        <Typography variant="h6" noWrap sx={{ fontWeight: 600, maxWidth: '100%' }}>
          {user.name}
        </Typography>
        <Chip size="small" label={ROLE_LABEL[user.role]} color={isAdmin ? 'primary' : 'default'} variant={isAdmin ? 'filled' : 'outlined'} />
        {user.role === 'GUEST' && !user.hasPin && (
          <Typography variant="caption" color="text.secondary">
            No PIN
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-around', borderTop: 1, borderColor: 'divider', mt: 'auto', py: 0.5 }}>
        <UserCardAction label={`Device access for ${user.name}`} title="Device access" onClick={onAccess} icon={<LockOpenIcon />} />
        <UserCardAction label={`Edit ${user.name}`} title="Edit" onClick={onEdit} icon={<EditIcon />} />
        <UserCardAction label={`Delete ${user.name}`} title="Delete" onClick={onDelete} icon={<DeleteIcon />} />
      </Box>
    </Paper>
  )
}

import ButtonBase from '@mui/material/ButtonBase'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { motion } from 'framer-motion'
import { riseItem, staggerParent } from '../motion/tokens'
import { UserAvatar } from '../avatars/UserAvatar'

export interface PickerUser {
  id: string
  name: string
  avatarColor: string
  avatarImage?: string | null
  hasPin: boolean
}

/** Grid of big avatar buttons that cascade in; tapping one selects that user. */
export function UserPicker({
  users,
  onSelect,
  disabled = false,
}: {
  users: PickerUser[]
  onSelect: (user: PickerUser) => void
  disabled?: boolean
}) {
  return (
    <Grid
      container
      spacing={2}
      component={motion.div}
      variants={staggerParent}
      initial="hidden"
      animate="shown"
      sx={{ justifyContent: 'center', maxWidth: 640 }}
    >
      {users.map((user) => (
        <Grid key={user.id} component={motion.div} variants={riseItem}>
          <ButtonBase
            aria-label={user.name}
            disabled={disabled}
            onClick={() => onSelect(user)}
            sx={{
              flexDirection: 'column',
              gap: 1.25,
              p: 2,
              borderRadius: 2,
              minWidth: 128,
              transition: 'background-color 160ms, transform 160ms',
              '&:hover': { bgcolor: 'action.hover', transform: 'translateY(-3px)' },
              '&:active': { transform: 'scale(0.96)' },
              '&.Mui-focusVisible': { outline: '2px solid var(--mui-palette-primary-main)' },
            }}
          >
            <UserAvatar name={user.name} color={user.avatarColor} image={user.avatarImage} size={84} glow />
            <Typography variant="h6">{user.name}</Typography>
          </ButtonBase>
        </Grid>
      ))}
    </Grid>
  )
}

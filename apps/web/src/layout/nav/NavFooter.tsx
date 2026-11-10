import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { UserAvatar } from '../../avatars/UserAvatar'
import { ProfileDialog } from '../../profile/ProfileDialog'

type Props = { isGuest: boolean; hasPin: boolean; userName: string; userColor: string; userImage: string | null; collapsed: boolean; onSignOut: () => void }

/** The signed-in user (opens their profile) and Sign out, pinned to the bottom of the menu. */
export function NavFooter({ isGuest, hasPin, userName, userColor, userImage, collapsed, onSignOut }: Props) {
  const [editing, setEditing] = useState(false)
  // A guest without a PIN has nothing to edit, so the avatar is just a label.
  const canEdit = !(isGuest && !hasPin)
  return (
    <Stack direction={collapsed ? 'column' : 'row'} spacing={1} sx={{ alignItems: 'center', p: 1.5, borderTop: 1, borderColor: 'divider' }}>
      {canEdit ? (
        <Tooltip title={collapsed ? `${userName}: edit profile` : ''} placement="right">
          <ButtonBase
            aria-label={`Edit your profile (${userName})`}
            onClick={() => setEditing(true)}
            sx={{ flexGrow: collapsed ? 0 : 1, minWidth: 0, justifyContent: 'flex-start', gap: 1, p: 0.5, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}
          >
            <UserAvatar name={userName} color={userColor} image={userImage} size={32} />
            {!collapsed && <Typography noWrap>{userName}</Typography>}
          </ButtonBase>
        </Tooltip>
      ) : (
        <Stack direction="row" sx={{ alignItems: 'center', flexGrow: collapsed ? 0 : 1, minWidth: 0, gap: 1, p: 0.5 }}>
          <UserAvatar name={userName} color={userColor} image={userImage} size={32} />
          {!collapsed && <Typography noWrap>{userName}</Typography>}
        </Stack>
      )}
      <Tooltip title="Sign out" placement={collapsed ? 'right' : 'top'}>
        <IconButton aria-label="Sign out" onClick={onSignOut} sx={{ color: 'text.secondary' }}>
          <LogoutOutlinedIcon />
        </IconButton>
      </Tooltip>
      {canEdit && editing && <ProfileDialog profile={{ name: userName, avatarColor: userColor, avatarImage: userImage }} hasPin={hasPin} pinOnly={isGuest && hasPin} onClose={() => setEditing(false)} />}
    </Stack>
  )
}

import type { AdminUser } from '../types'
import { ConfirmDeleteUserDialog } from './ConfirmDeleteUserDialog'
import { GrantsEditor } from './GrantsEditor'
import { UserEditDialog } from './UserEditDialog'

export type UserDialogState = { type: 'create' } | { type: 'edit' | 'access' | 'delete'; user: AdminUser } | null

type Props = { state: UserDialogState; currentUserId: string | undefined; onClose: () => void }

/** Renders whichever user dialog is open. */
export function UserDialogs({ state, currentUserId, onClose }: Props) {
  if (!state) return null
  switch (state.type) {
    case 'create':
      return <UserEditDialog onClose={onClose} />
    case 'edit':
      return <UserEditDialog user={state.user} isSelf={state.user.id === currentUserId} onClose={onClose} />
    case 'access':
      return <GrantsEditor user={state.user} onClose={onClose} />
    case 'delete':
      return <ConfirmDeleteUserDialog user={state.user} isSelf={state.user.id === currentUserId} onClose={onClose} />
  }
}

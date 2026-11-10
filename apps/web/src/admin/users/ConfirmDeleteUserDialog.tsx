import { ConfirmDialog } from '../common/ConfirmDialog'
import { useDeleteUser } from '../data/useUserMutations'
import { ignoreUnauthenticated } from '../lib/ignoreUnauthenticated'
import type { AdminUser } from '../types'

type Props = { user: AdminUser; isSelf: boolean; onClose: () => void }

export function ConfirmDeleteUserDialog({ user, isSelf, onClose }: Props) {
  const deleteUser = useDeleteUser()
  // Deleting yourself ends your session: skip the refetch and let the sign-out flow run.
  const onConfirm = () =>
    isSelf ? ignoreUnauthenticated(() => deleteUser(user.id, { refetch: false })) : deleteUser(user.id)
  return (
    <ConfirmDialog title={`Delete ${user.name}?`} confirmLabel="Delete" onConfirm={onConfirm} onClose={onClose}>
      {isSelf
        ? 'You are deleting your own account. You will be signed out and can no longer log in. The last admin cannot be deleted.'
        : `${user.name} will be signed out everywhere and can no longer log in. The last admin cannot be deleted.`}
    </ConfirmDialog>
  )
}

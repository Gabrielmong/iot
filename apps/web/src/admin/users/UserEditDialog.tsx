import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { FormDialog } from '../common/FormDialog'
import { SelectField } from '../../common/SelectField'
import { PinField } from '../common/PinField'
import { useCreateUser, useUpdateUser } from '../data/useUserMutations'
import { AVATAR_COLORS } from '../../avatars/avatarColors'
import { isValidPin } from '../lib/pin'
import { ignoreUnauthenticated } from '../lib/ignoreUnauthenticated'
import { type Role, signOutWarning, signsOut, type UserForm, userUpdate } from '../lib/userEdit'
import type { AdminUser } from '../types'
import { AvatarColorPicker } from '../../avatars/AvatarColorPicker'
import { AvatarImagePicker } from '../../avatars/AvatarImagePicker'
import { GuestPinOption } from './GuestPinOption'

const ROLE_OPTIONS = [
  { value: 'USER', label: 'User' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'GUEST', label: 'Guest' },
]

const pinLabel = (user: AdminUser | undefined, isGuest: boolean) => {
  if (!user) return 'PIN'
  return isGuest && !user.hasPin ? 'PIN (leave blank to keep none)' : 'PIN (leave blank to keep)'
}

type Props = {
  /** The user being edited; omit to create one. */
  user?: AdminUser
  /** Whether `user` is the signed-in admin (changes the sign-out warning). */
  isSelf?: boolean
  onClose: () => void
}

/** Create or edit a user. The PIN is write-only: blank on open, and blank on edit means unchanged. */
export function UserEditDialog({ user, isSelf = false, onClose }: Props) {
  const create = useCreateUser()
  const update = useUpdateUser()
  const [form, setForm] = useState<UserForm>({
    name: user?.name ?? '',
    avatarColor: user?.avatarColor ?? AVATAR_COLORS[0],
    avatarImage: user?.avatarImage ?? '',
    role: user?.role ?? 'USER',
    pin: '',
    clearPin: false,
  })
  const patch = (changes: Partial<UserForm>) => setForm((f) => ({ ...f, ...changes }))

  const isGuest = form.role === 'GUEST'
  // A guest may go without a PIN; a PIN-less guest made a user or admin must get one.
  const blankPinOk = isGuest ? user !== undefined || form.clearPin : user?.hasPin !== false && user !== undefined
  const pinOk = form.pin === '' ? blankPinOk : isValidPin(form.pin)
  const showNoPin = isGuest && (!user || user.hasPin)
  const warning = user ? signOutWarning(user, form, isSelf) : null
  const submit = () => {
    if (!user) return create({ name: form.name.trim(), ...(form.pin !== '' && { pin: form.pin }), role: form.role, avatarColor: form.avatarColor, avatarImage: form.avatarImage || null })
    const variables = userUpdate(user, { ...form, name: form.name.trim() })
    // Changing your own role or PIN ends your session: skip the refetch and let the sign-out flow run.
    if (isSelf && signsOut(user, form)) return ignoreUnauthenticated(() => update(variables, { refetch: false }))
    return update(variables)
  }

  return (
    <FormDialog
      title={user ? `Edit ${user.name}` : 'Add user'}
      submitLabel="Save"
      canSubmit={form.name.trim() !== '' && pinOk}
      onSubmit={submit}
      onClose={onClose}
    >
      <TextField label="Name" value={form.name} onChange={(e) => patch({ name: e.target.value })} fullWidth autoFocus />
      <AvatarImagePicker name={form.name} color={form.avatarColor} value={form.avatarImage} onChange={(avatarImage) => patch({ avatarImage })} />
      <AvatarColorPicker value={form.avatarColor} onChange={(avatarColor) => patch({ avatarColor })} />
      <SelectField label="Role" value={form.role} options={ROLE_OPTIONS} onChange={(role) => patch({ role: role as Role, ...(role !== 'GUEST' && { clearPin: false }) })} />
      {showNoPin && <GuestPinOption checked={form.clearPin} onChange={(clearPin) => patch({ clearPin, ...(clearPin && { pin: '' }) })} />}
      {!(showNoPin && form.clearPin) && (
        <PinField
          label={pinLabel(user, isGuest)}
          value={form.pin}
          onChange={(pin) => patch({ pin })}
          helperText="4 to 8 digits"
        />
      )}
      {warning && <Alert severity="warning">{warning}</Alert>}
    </FormDialog>
  )
}

import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { GetAndroidAppLink } from '../android/GetAndroidAppLink'
import { FormDialog } from '../admin/common/FormDialog'
import { AvatarColorPicker } from '../avatars/AvatarColorPicker'
import { AvatarImagePicker } from '../avatars/AvatarImagePicker'
import { ChangePinSection } from './ChangePinSection'
import { PinDialog } from './PinDialog'
import { useUpdateProfile } from './data/useUpdateProfile'
import { type Profile, profileChanges, profileForm } from './profileChanges'

type Props = { profile: Profile; hasPin?: boolean; pinOnly?: boolean; onClose: () => void }

/** Anyone's own profile: name, picture and color, plus Change PIN when they have a PIN. `pinOnly` (guests) shows just Change PIN. */
export function ProfileDialog({ profile, hasPin = false, pinOnly = false, onClose }: Props) {
  const save = useUpdateProfile()
  const [form, setForm] = useState(() => profileForm(profile))
  const patch = (changes: Partial<typeof form>) => setForm((f) => ({ ...f, ...changes }))
  const changes = profileChanges(profile, form)
  if (pinOnly) return <PinDialog onClose={onClose} />

  return (
    <FormDialog
      title="Your profile"
      submitLabel="Save"
      canSubmit={form.name.trim() !== '' && Object.keys(changes).length > 0}
      onSubmit={() => save(changes)}
      onClose={onClose}
    >
      <TextField label="Name" value={form.name} onChange={(e) => patch({ name: e.target.value })} fullWidth />
      <AvatarImagePicker name={form.name} color={form.avatarColor} value={form.avatarImage} onChange={(avatarImage) => patch({ avatarImage })} />
      <AvatarColorPicker value={form.avatarColor} onChange={(avatarColor) => patch({ avatarColor })} />
      {hasPin && <ChangePinSection />}
      <GetAndroidAppLink />
    </FormDialog>
  )
}

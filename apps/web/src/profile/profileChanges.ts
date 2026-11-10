import type { ProfileChanges } from './data/useUpdateProfile'

export type Profile = { name: string; avatarColor: string; avatarImage: string | null }
/** `avatarImage` is "" for no picture. */
export type ProfileForm = { name: string; avatarColor: string; avatarImage: string }

export const profileForm = (p: Profile): ProfileForm => ({ name: p.name, avatarColor: p.avatarColor, avatarImage: p.avatarImage ?? '' })

/** Only what changed ("" clears the picture); the name is trimmed. */
export function profileChanges(current: Profile, form: ProfileForm): ProfileChanges {
  const name = form.name.trim()
  return {
    ...(name !== current.name && { name }),
    ...(form.avatarColor !== current.avatarColor && { avatarColor: form.avatarColor }),
    ...(form.avatarImage !== (current.avatarImage ?? '') && { avatarImage: form.avatarImage }),
  }
}

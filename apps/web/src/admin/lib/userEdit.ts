import type { Role } from '../../gql/graphql'

export type { Role }
/** `avatarImage` is '' for no picture. `clearPin` is only meaningful for a GUEST ("No PIN"). */
export type UserForm = { name: string; avatarColor: string; avatarImage: string; role: Role; pin: string; clearPin: boolean }
type UserFields = { name: string; avatarColor: string; avatarImage?: string | null; role: Role; hasPin?: boolean }

/** Whether the edit drops a guest's PIN (only a guest that has one can lose it). */
const clearsPin = (user: UserFields, form: UserForm): boolean => form.role === 'GUEST' && form.clearPin && user.hasPin !== false

/** Role or PIN changes sign the user out everywhere. */
export const signsOut = (user: UserFields, form: UserForm): boolean =>
  form.role !== user.role || form.pin !== '' || clearsPin(user, form)

/** Warning text for the edit dialog, or null when the edit doesn't sign anyone out. */
export function signOutWarning(user: UserFields, form: UserForm, isSelf: boolean): string | null {
  if (!signsOut(user, form)) return null
  const cleanup = form.role === 'GUEST' && user.role !== 'GUEST' ? ` It also removes ${isSelf ? 'your' : `${user.name}'s`} cameras, computers, personal routines and camera groups.` : ''
  const base = isSelf
    ? "You're changing your own role or PIN. You'll be signed out on every device, including this one."
    : `Changing the role or PIN signs ${user.name} out on every device.`
  return base + cleanup
}

/** `updateUser` variables carrying only what changed, so an unchanged role or PIN is never re-sent. */
export function userUpdate(user: UserFields & { id: string }, form: UserForm) {
  return {
    id: user.id,
    ...(form.name !== user.name && { name: form.name }),
    ...(form.avatarColor !== user.avatarColor && { avatarColor: form.avatarColor }),
    // '' clears the picture on the server.
    ...(form.avatarImage !== (user.avatarImage ?? '') && { avatarImage: form.avatarImage }),
    ...(form.role !== user.role && { role: form.role }),
    ...(form.pin !== '' && { pin: form.pin }),
    ...(form.pin === '' && clearsPin(user, form) && { clearPin: true }),
  }
}

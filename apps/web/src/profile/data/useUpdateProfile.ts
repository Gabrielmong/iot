import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { UPDATE_PROFILE } from './documents'

export type ProfileChanges = { name?: string; avatarColor?: string; avatarImage?: string }

/**
 * Saves the signed-in user's own name and avatar. The reply updates the cached User, so the menu
 * and anything else showing `me` change at once; the sign-in list is refetched for its next visit.
 */
export function useUpdateProfile() {
  const [mutate] = useMutation(UPDATE_PROFILE, { refetchQueries: ['LoginUsers'] })
  return useCallback((changes: ProfileChanges) => mutate({ variables: changes }), [mutate])
}

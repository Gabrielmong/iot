import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { HOME_NAME, SET_HOME_NAME } from './documents'

/** Renames the home and writes the stored name straight into the cached `homeName`. */
export function useSetHomeName() {
  const [mutate] = useMutation(SET_HOME_NAME, {
    update: (cache, { data }) => {
      if (data) cache.writeQuery({ query: HOME_NAME, data: { homeName: data.setHomeName } })
    },
  })
  return useCallback((name: string) => mutate({ variables: { name } }), [mutate])
}

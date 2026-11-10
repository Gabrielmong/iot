import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { DELETE_ROUTINE } from './documents'

/** `remove(id)` deletes a routine and evicts it from the cache; errors are thrown. */
export function useDeleteRoutine() {
  const [mutate] = useMutation(DELETE_ROUTINE)
  return useCallback(
    async (id: string) => {
      await mutate({
        variables: { id },
        update: (cache) => {
          cache.evict({ id: cache.identify({ __typename: 'Routine', id }) })
          cache.gc()
        },
      })
    },
    [mutate],
  )
}

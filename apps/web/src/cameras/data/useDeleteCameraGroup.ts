import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import { DELETE_CAMERA_GROUP } from './documents'

/** `remove(id)` deletes a camera group and evicts it from the cache; errors are thrown. */
export function useDeleteCameraGroup() {
  const [mutate] = useMutation(DELETE_CAMERA_GROUP)
  return useCallback(
    async (id: string) => {
      await mutate({
        variables: { id },
        update: (cache) => {
          cache.evict({ id: cache.identify({ __typename: 'CameraGroup', id }) })
          cache.gc()
        },
      })
    },
    [mutate],
  )
}

import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import type { CameraGroupInput } from '../types'
import { CAMERA_GROUPS, CREATE_CAMERA_GROUP, OTHER_CAMERA_GROUPS, UPDATE_CAMERA_GROUP } from './documents'

/** `save(id | null, input)` creates or updates a camera group and resolves with its id; errors are thrown. */
export function useSaveCameraGroup() {
  const refetchQueries = [CAMERA_GROUPS, OTHER_CAMERA_GROUPS]
  // Wait for the lists, so a view following the saved group finds it at once.
  const [create, createState] = useMutation(CREATE_CAMERA_GROUP, { refetchQueries, awaitRefetchQueries: true })
  const [update, updateState] = useMutation(UPDATE_CAMERA_GROUP, { refetchQueries, awaitRefetchQueries: true })
  const save = useCallback(
    async (id: string | null, input: CameraGroupInput): Promise<string> => {
      if (id) return (await update({ variables: { id, input } })).data!.updateCameraGroup.id
      return (await create({ variables: { input } })).data!.createCameraGroup.id
    },
    [create, update],
  )
  return { save, saving: createState.loading || updateState.loading }
}

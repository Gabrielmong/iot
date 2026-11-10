import { useMutation } from '@apollo/client/react'
import { useCallback } from 'react'
import type { RoutineInput } from '../types'
import { CREATE_ROUTINE, ROUTINES, UPDATE_ROUTINE } from './documents'

/** `save(id | null, input)` creates or updates a routine and resolves with its id; errors are thrown. */
export function useSaveRoutine() {
  const [create, createState] = useMutation(CREATE_ROUTINE, { refetchQueries: [ROUTINES] })
  const [update, updateState] = useMutation(UPDATE_ROUTINE, { refetchQueries: [ROUTINES] })
  const save = useCallback(
    async (id: string | null, input: RoutineInput): Promise<string> => {
      if (id) {
        const { data } = await update({ variables: { id, input } })
        return data!.updateRoutine.id
      }
      const { data } = await create({ variables: { input } })
      return data!.createRoutine.id
    },
    [create, update],
  )
  return { save, saving: createState.loading || updateState.loading }
}

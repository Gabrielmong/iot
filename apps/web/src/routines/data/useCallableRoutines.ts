import { useQuery } from '@apollo/client/react'
import type { RoutineScope } from '../../gql/graphql'
import { CALLABLE_ROUTINES } from './documents'

/** The routines a routine of this scope can run (never itself, when `routineId` is given). */
export function useCallableRoutines(scope: RoutineScope, routineId: string | null) {
  const { data, loading } = useQuery(CALLABLE_ROUTINES, { variables: { scope, routineId }, fetchPolicy: 'cache-and-network' })
  return { routines: data?.callableRoutines ?? [], loading }
}

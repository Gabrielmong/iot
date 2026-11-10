import type { RoutineFieldsFragment, RoutineInput as ApiRoutineInput, RoutineRunFieldsFragment } from '../gql/graphql'

export type Routine = RoutineFieldsFragment
export type RoutineRun = RoutineRunFieldsFragment
export type RoutineInput = ApiRoutineInput
/** The routine id used for the caller's own Try it run. */
export const TRY_ID = 'try'

import { graphql } from '../../gql'

export const ROUTINE_RUN_FIELDS = graphql(`
  fragment RoutineRunFields on RoutineRun {
    status
    startedAt
    endedAt
    problems { step deviceId deviceName reason routineName }
    hiddenProblems
    currentStep
    currentPath { routineName step stepCount }
    waitUntil
    startedBy
  }
`)

export const ROUTINE_FIELDS = graphql(`
  fragment RoutineFields on Routine {
    id
    name
    scope
    editable
    audience
    room { id name }
    owner { id name role }
    steps { kind waitMinutes routineId routineName actions { deviceId deviceExists on brightness color { r g b } colorTempK pcPower } }
    schedules { time days enabled }
    lastRun { ...RoutineRunFields }
  }
`)

export const ROUTINE_LAST_RUN = graphql(`
  fragment RoutineLastRun on Routine {
    lastRun { ...RoutineRunFields }
  }
`)

export const ROUTINES = graphql(`
  query Routines {
    routines { ...RoutineFields }
  }
`)

export const OTHER_ROUTINES = graphql(`
  query OtherRoutines {
    otherRoutines { ...RoutineFields }
  }
`)

export const ROUTINE = graphql(`
  query Routine($id: ID!) {
    routine(id: $id) { ...RoutineFields }
  }
`)

export const CREATE_ROUTINE = graphql(`
  mutation CreateRoutine($input: RoutineInput!) {
    createRoutine(input: $input) { ...RoutineFields }
  }
`)

export const UPDATE_ROUTINE = graphql(`
  mutation UpdateRoutine($id: ID!, $input: RoutineInput!) {
    updateRoutine(id: $id, input: $input) { ...RoutineFields }
  }
`)

export const DELETE_ROUTINE = graphql(`
  mutation DeleteRoutine($id: ID!) {
    deleteRoutine(id: $id)
  }
`)

export const RUN_ROUTINE = graphql(`
  mutation RunRoutine($id: ID!) {
    runRoutine(id: $id)
  }
`)

export const STOP_ROUTINE = graphql(`
  mutation StopRoutine($id: ID!) {
    stopRoutine(id: $id)
  }
`)

export const TRY_ROUTINE = graphql(`
  mutation TryRoutine($input: RoutineInput!) {
    tryRoutine(input: $input)
  }
`)

export const STOP_TRY = graphql(`
  mutation StopTry {
    stopTry
  }
`)

export const ROUTINE_RUN_CHANGED = graphql(`
  subscription RoutineRunChanged {
    routineRunChanged { routineId run { ...RoutineRunFields } }
  }
`)

export const ROUTINES_CHANGED = graphql(`
  subscription RoutinesChanged {
    routinesChanged
  }
`)

export const CALLABLE_ROUTINES = graphql(`
  query CallableRoutines($scope: RoutineScope!, $routineId: ID) {
    callableRoutines(scope: $scope, routineId: $routineId) { id name }
  }
`)

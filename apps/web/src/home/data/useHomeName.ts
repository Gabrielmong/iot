import { useQuery } from '@apollo/client/react'
import { HOME_NAME } from './documents'

export const DEFAULT_HOME_NAME = 'Home'

/** The household's display name; "Home" while loading or if the server can't be reached. */
export function useHomeName(): string {
  const { data } = useQuery(HOME_NAME)
  return data?.homeName ?? DEFAULT_HOME_NAME
}

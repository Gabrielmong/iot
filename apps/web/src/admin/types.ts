import type { AdminDeviceFieldsFragment, UsersQuery } from '../gql/graphql'

export type AdminDevice = AdminDeviceFieldsFragment
export type AdminUser = UsersQuery['users'][number]
export type { Room } from '../dashboard/types'

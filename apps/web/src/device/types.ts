import type { DeviceQuery } from '../gql/graphql'

export type DeviceDetail = NonNullable<DeviceQuery['device']>

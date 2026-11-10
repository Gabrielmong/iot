import type { DeviceFieldsFragment, RoomsQuery, StatePatchInput } from '../gql/graphql'

export type Device = DeviceFieldsFragment
export type LightState = NonNullable<Device['state']['light']>
export type Rgb = { r: number; g: number; b: number }
export type Room = RoomsQuery['rooms'][number]
export type StatePatch = StatePatchInput

import type { DeviceFieldsFragment } from '../gql/graphql'

type Device = DeviceFieldsFragment
type Light = NonNullable<Device['state']['light']>

export type DeviceOpts = Partial<Pick<Device, 'id' | 'name' | 'brand' | 'kind' | 'status' | 'parentId' | 'room'>> & {
  online?: boolean
  on?: boolean | null
}

/** A device as the server returns it (with `__typename`s so the Apollo cache normalizes it). */
export function deviceFixture(o: DeviceOpts = {}, light: Light | null = null): Device {
  const room = o.room === undefined ? { id: 'r1', name: 'Living room' } : o.room
  const device = {
    __typename: 'Device',
    id: o.id ?? 'd1',
    name: o.name ?? 'Desk lamp',
    brand: o.brand ?? 'TUYA',
    kind: o.kind ?? 'PLUG',
    model: null,
    room: room && { __typename: 'Room', ...room },
    parentId: o.parentId ?? null,
    status: o.status ?? 'OK',
    connection: 'LOCAL',
    tv: null,
    state: {
      __typename: 'DeviceState',
      online: o.online ?? true,
      // Like the server: lights report on/off only in `light.on`; `state.on` is null.
      on: o.on !== undefined ? o.on : light ? null : false,
      light: light && { __typename: 'LightState', ...light, color: light.color && { __typename: 'Rgb', ...light.color } },
    },
  }
  return device as Device
}

/** A Govee/Tuya light; defaults to on, purple, 70%. */
export function lightFixture(light: Partial<Light> = {}, o: DeviceOpts = {}): Device {
  const full: Light = {
    on: true,
    brightness: 70,
    mode: 'color',
    color: { r: 155, g: 89, b: 255 },
    colorTempK: null,
    ...light,
  }
  return deviceFixture({ kind: 'LIGHT', brand: 'GOVEE', ...o }, full)
}

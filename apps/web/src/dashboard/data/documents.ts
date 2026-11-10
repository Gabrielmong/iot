import { graphql } from '../../gql'

export const DEVICE_FIELDS = graphql(`
  fragment DeviceFields on Device {
    id
    name
    brand
    kind
    model
    room { id name }
    parentId
    status
    connection
    state {
      online
      on
      light { on brightness mode color { r g b } colorTempK }
    }
    tv { apps canPowerOn }
  }
`)

export const DEVICES = graphql(`
  query Devices {
    devices { ...DeviceFields }
  }
`)

export const ROOMS = graphql(`
  query Rooms {
    rooms { id name sortOrder }
  }
`)

export const SET_DEVICE_STATE = graphql(`
  mutation SetDeviceState($id: ID!, $patch: StatePatchInput!) {
    setDeviceState(id: $id, patch: $patch) { ...DeviceFields }
  }
`)

export const DEVICE_STATE = graphql(`
  subscription DeviceState {
    deviceState { ...DeviceFields }
  }
`)

export const DEVICES_CHANGED = graphql(`
  subscription DevicesChanged {
    devicesChanged
  }
`)

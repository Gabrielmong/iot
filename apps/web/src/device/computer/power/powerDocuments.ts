import { graphql } from '../../../gql'

export const PC_POWER = graphql(`
  mutation PcPower($deviceId: ID!, $action: PcPowerAction!) {
    pcPower(deviceId: $deviceId, action: $action) { id deviceId action phase secondsLeft requestedBy }
  }
`)

export const PC_POWER_CANCEL = graphql(`
  mutation PcPowerCancel($deviceId: ID!, $id: ID!) {
    pcPowerCancel(deviceId: $deviceId, id: $id)
  }
`)

export const PC_POWER_STATE = graphql(`
  subscription PcPowerStateChanged($deviceId: ID!) {
    pcPowerState(deviceId: $deviceId) { id deviceId action phase secondsLeft requestedBy }
  }
`)

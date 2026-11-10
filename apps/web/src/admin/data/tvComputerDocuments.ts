import { graphql } from '../../gql'

export const ADD_COMPUTER = graphql(`
  mutation AddComputer($name: String!, $roomId: ID, $mac: String!, $ip: String) {
    addComputer(name: $name, roomId: $roomId, mac: $mac, ip: $ip) { ...AdminDeviceFields }
  }
`)

export const UPDATE_COMPUTER = graphql(`
  mutation UpdateComputer($id: ID!, $mac: String!, $ip: String) {
    updateComputer(id: $id, mac: $mac, ip: $ip) { ...AdminDeviceFields }
  }
`)

export const ADD_TV_BY_IP = graphql(`
  mutation AddTvByIp($ip: String!) {
    addTvByIp(ip: $ip) { ...AdminDeviceFields }
  }
`)

export const START_TV_PAIRING = graphql(`
  mutation StartTvPairing($deviceId: ID!) {
    startTvPairing(deviceId: $deviceId)
  }
`)

export const FINISH_TV_PAIRING = graphql(`
  mutation FinishTvPairing($deviceId: ID!, $code: String) {
    finishTvPairing(deviceId: $deviceId, code: $code) { ...AdminDeviceFields }
  }
`)

export const CANCEL_TV_PAIRING = graphql(`
  mutation CancelTvPairing($deviceId: ID!) {
    cancelTvPairing(deviceId: $deviceId)
  }
`)

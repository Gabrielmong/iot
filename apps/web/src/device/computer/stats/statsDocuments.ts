import { graphql } from '../../../gql'

export const PC_STATS = graphql(`
  subscription PcStatsLive($deviceId: ID!) {
    pcStats(deviceId: $deviceId) {
      cpu
      ramUsed
      ramTotal
      gpu { name load tempC }
      disks { mount free total }
      netUp
      netDown
      uptimeS
      user
      idleS
    }
  }
`)

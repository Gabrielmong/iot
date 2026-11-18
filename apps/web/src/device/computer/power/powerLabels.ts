import type { PcPowerAction } from '../../../gql/graphql'

/** Button labels, in the order they're shown. */
export const POWER_LABEL: Record<PcPowerAction, string> = { SLEEP: 'Sleep', SHUTDOWN: 'Shut down', RESTART: 'Restart' }

export const POWER_ACTIONS = Object.keys(POWER_LABEL) as PcPowerAction[]

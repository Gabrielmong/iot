import { useMutation, useSubscription } from '@apollo/client/react'
import { useCallback, useState } from 'react'
import type { PcPowerAction, PcPowerStateChangedSubscription } from '../../../gql/graphql'
import { PC_POWER, PC_POWER_CANCEL, PC_POWER_STATE } from './powerDocuments'

export type PowerState = PcPowerStateChangedSubscription['pcPowerState']

/** Requests a power action and follows its progress (the latest state, from the request or the live updates). */
export function usePcPower(deviceId: string) {
  const [state, setState] = useState<PowerState | null>(null)
  const [request] = useMutation(PC_POWER)
  const [cancelRequest] = useMutation(PC_POWER_CANCEL)
  useSubscription(PC_POWER_STATE, { variables: { deviceId }, onData: ({ data }) => data.data && setState(data.data.pcPowerState) })
  const start = useCallback(
    async (action: PcPowerAction) => {
      const { data } = await request({ variables: { deviceId, action } })
      if (data) setState(data.pcPower)
    },
    [deviceId, request],
  )
  const cancel = useCallback((id: string) => cancelRequest({ variables: { deviceId, id } }), [deviceId, cancelRequest])
  return { state, start, cancel }
}

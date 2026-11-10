import { useState } from 'react'
import { FormDialog } from '../../common/FormDialog'
import { useUpdateComputer } from '../../data/useTvComputerMutations'
import type { AdminDevice } from '../../types'
import { isValidMac } from '../../lib/macAddress'
import { MacIpFields } from './MacIpFields'

/** Change a PC's MAC or IP (an empty IP stops the on/off check). */
export function EditComputerDialog({ device, onClose }: { device: AdminDevice; onClose: () => void }) {
  const update = useUpdateComputer()
  const [mac, setMac] = useState(device.mac ?? '')
  const [ip, setIp] = useState(device.ip ?? '')
  return (
    <FormDialog
      title={`Edit ${device.name}`}
      submitLabel="Save"
      canSubmit={isValidMac(mac)}
      onSubmit={() => update({ id: device.id, mac: mac.trim(), ip: ip.trim() || null })}
      onClose={onClose}
    >
      <MacIpFields mac={mac} ip={ip} onMac={setMac} onIp={setIp} autoFocus />
    </FormDialog>
  )
}

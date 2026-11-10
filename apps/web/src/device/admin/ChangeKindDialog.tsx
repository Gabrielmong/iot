import { useState } from 'react'
import { FormDialog } from '../../admin/common/FormDialog'
import { useUpdateDevice } from '../../admin/data/useDeviceMutations'
import { KindSelect } from '../../admin/devices/KindSelect'
import type { DeviceDetail } from '../types'

type Props = { device: Pick<DeviceDetail, 'id' | 'name' | 'kind'>; onClose: () => void }

/** Change what kind of device this is. */
export function ChangeKindDialog({ device, onClose }: Props) {
  const update = useUpdateDevice()
  const [kind, setKind] = useState<string>(device.kind)
  return (
    <FormDialog
      title={`Type of ${device.name}`}
      submitLabel="Save"
      onSubmit={() => update({ id: device.id, kind: kind as DeviceDetail['kind'] })}
      onClose={onClose}
    >
      <KindSelect value={kind} onChange={setKind} />
    </FormDialog>
  )
}

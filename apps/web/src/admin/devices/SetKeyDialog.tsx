import { useState } from 'react'
import { FormDialog } from '../common/FormDialog'
import { SecretField } from '../common/SecretField'
import { useSetTuyaLocalKey } from '../data/useDeviceMutations'
import type { AdminDevice } from '../types'

type Props = { device: Pick<AdminDevice, 'id' | 'name'>; onClose: () => void }

/** Enter a Tuya local key by hand. Write-only: never prefilled, never shown again. */
export function SetKeyDialog({ device, onClose }: Props) {
  const setKey = useSetTuyaLocalKey()
  const [localKey, setLocalKey] = useState('')
  return (
    <FormDialog
      title={`Local key for ${device.name}`}
      submitLabel="Save key"
      canSubmit={localKey.trim() !== ''}
      onSubmit={() => setKey(device.id, localKey.trim())}
      onClose={onClose}
    >
      <SecretField
        label="Local key"
        value={localKey}
        onChange={(e) => setLocalKey(e.target.value)}
        helperText="Stored on the server and never shown again. Syncing from Tuya also sets it."
        autoFocus
      />
    </FormDialog>
  )
}

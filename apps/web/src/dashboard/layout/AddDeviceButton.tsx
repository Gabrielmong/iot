import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import { useState } from 'react'
import type { DeviceGroup } from '../lib/devicesToAdd'
import { AddDeviceDialog } from './AddDeviceDialog'

type Props = { groups: readonly DeviceGroup[]; onAdd: (deviceId: string) => void }

/** "Add device" while editing Home: opens the device picker; picking one adds it and closes. */
export function AddDeviceButton({ groups, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
        Add device
      </Button>
      <AddDeviceDialog
        open={open}
        groups={groups}
        onClose={() => setOpen(false)}
        onPick={(id) => {
          setOpen(false)
          onAdd(id)
        }}
      />
    </>
  )
}

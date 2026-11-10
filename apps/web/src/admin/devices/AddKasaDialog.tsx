import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { FormDialog } from '../common/FormDialog'
import { useAddKasaByIp } from '../data/useDeviceMutations'

/** Add a Kasa device by IP address when discovery does not find it. */
export function AddKasaDialog({ onClose }: { onClose: () => void }) {
  const add = useAddKasaByIp()
  const [ip, setIp] = useState('')
  return (
    <FormDialog title="Add Kasa by IP" submitLabel="Add" canSubmit={ip.trim() !== ''} onSubmit={() => add(ip.trim())} onClose={onClose}>
      <TextField
        label="IP address"
        value={ip}
        onChange={(e) => setIp(e.target.value)}
        placeholder="192.168.1.50"
        helperText="Needs TP-Link credentials saved on the Integrations page."
        fullWidth
        autoFocus
      />
    </FormDialog>
  )
}

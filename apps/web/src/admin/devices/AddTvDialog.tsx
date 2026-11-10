import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { FormDialog } from '../common/FormDialog'
import { useAddTvByIp } from '../data/useTvComputerMutations'

/** Add a TV by IP when discovery doesn't find it; it then shows under New on network. */
export function AddTvDialog({ onClose }: { onClose: () => void }) {
  const add = useAddTvByIp()
  const [ip, setIp] = useState('')
  return (
    <FormDialog title="Add TV by IP" submitLabel="Add" canSubmit={ip.trim() !== ''} onSubmit={() => add(ip.trim())} onClose={onClose}>
      <TextField
        label="IP address"
        value={ip}
        onChange={(e) => setIp(e.target.value)}
        placeholder="192.168.0.163"
        helperText="Android TV / Google TV and Samsung (2016 or newer). The TV must be on."
        fullWidth
        autoFocus
      />
    </FormDialog>
  )
}

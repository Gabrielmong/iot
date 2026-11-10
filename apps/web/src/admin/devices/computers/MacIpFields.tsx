import TextField from '@mui/material/TextField'
import { isValidMac, MAC_MESSAGE } from '../../lib/macAddress'

type Props = { mac: string; ip: string; onMac: (mac: string) => void; onIp: (ip: string) => void; autoFocus?: boolean }

/** A computer's MAC (checked as you type) and optional IP address. */
export function MacIpFields({ mac, ip, onMac, onIp, autoFocus = false }: Props) {
  const badMac = mac.trim() !== '' && !isValidMac(mac)
  return (
    <>
      <TextField
        label="MAC address"
        value={mac}
        onChange={(e) => onMac(e.target.value)}
        placeholder="AA:BB:CC:DD:EE:FF"
        error={badMac}
        helperText={badMac ? MAC_MESSAGE : 'Of the wired network adapter.'}
        fullWidth
        autoFocus={autoFocus}
      />
      <TextField
        label="IP address (optional)"
        value={ip}
        onChange={(e) => onIp(e.target.value)}
        placeholder="192.168.0.50"
        helperText="With an IP, the app shows whether the PC is on."
        fullWidth
      />
    </>
  )
}


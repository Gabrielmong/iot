import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows'
import Button from '@mui/material/Button'
import type { DeviceDetail } from '../types'
import { openRemoteDesktop } from './rdp/openRemoteDesktop'
import { useRemoteDesktopLaunch } from './rdp/useRemoteDesktopLaunch'
import { useWakeThenOpen } from './useWakeThenOpen'

type Props = { device: DeviceDetail; onWake: () => Promise<boolean> | void }

/** Wakes the PC if needed, then opens Remote Desktop. Shown once the server has seen Remote Desktop answer. */
export function RemoteDesktopButton({ device, onWake }: Props) {
  const address = device.computer?.rdpAddress ?? null
  const launch = useRemoteDesktopLaunch(!address)
  const { start, pending } = useWakeThenOpen(device, address ? () => openRemoteDesktop(address, device.name, launch) : null, onWake)
  if (!address) return null
  return (
    <Button variant="outlined" size="large" startIcon={<DesktopWindowsIcon />} onClick={start} disabled={pending} sx={{ minHeight: 48, borderRadius: '14px' }}>
      {pending ? 'Waking…' : 'Remote Desktop'}
    </Button>
  )
}

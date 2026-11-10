import CircularProgress from '@mui/material/CircularProgress'
import { QueryError } from '../admin/common/QueryError'
import { useDevice } from './data/useDevice'
import { DeviceLayout } from './DeviceLayout'
import { DeviceNotFound } from './DeviceNotFound'

/** Loads one device live and shows it, a spinner, an error with retry, or the not-found message. */
export function DeviceView({ id }: { id: string }) {
  const { device, error, refetch } = useDevice(id)
  if (device) return <DeviceLayout device={device} />
  if (device === null) return <DeviceNotFound />
  if (error) return <QueryError what="device" onRetry={() => void refetch()} />
  return <CircularProgress sx={{ m: 4 }} aria-label="Loading device" />
}

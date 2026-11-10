import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useCallback } from 'react'
import { useSubmit } from '../../admin/common/useSubmit'

const noop = () => {}

/** The camera streams locally over ONVIF; it can be switched back to the Tuya cloud. */
export function OnvifLocalStatus({ switchToCloud }: { switchToCloud: () => Promise<void> }) {
  const run = useCallback(() => switchToCloud(), [switchToCloud])
  const { submit, pending, error } = useSubmit(run, noop)
  return (
    <Stack spacing={2}>
      <Alert severity="success">Streaming locally</Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <Button variant="outlined" size="large" disabled={pending} onClick={() => void submit()}>
        Switch back to cloud
      </Button>
    </Stack>
  )
}

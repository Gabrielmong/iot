import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTuyaSync } from '../data/useTuyaSync'
import { SyncResult } from './SyncResult'

/** The one action that touches the Tuya cloud: pull local keys for devices seen on the network. */
export function TuyaSyncPanel() {
  const { sync, syncing, result, error } = useTuyaSync()
  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Tuya keys are pulled from the cloud only when you press sync. Nothing else contacts the cloud.
      </Typography>
      <Button variant="outlined" size="large" disabled={syncing} onClick={() => void sync()} sx={{ alignSelf: 'flex-start' }}>
        Sync keys from Tuya
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {result && <SyncResult matched={result.matched} unmatched={result.unmatched} found={result.found} />}
    </Stack>
  )
}
